var express = require('express');
const axios = require('axios');
var router = express.Router();

const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

// Import the new utils
const { 
    calculateStakingMetricsFromMetaData, 
    validateStakingData,
    TIMESTAMP_INTERVAL_VALUES,
    isStakingContractEnded,
    getRemainingStakingTime
} = require('./utils');

// Simple in-memory cache for staking meta data (in production, use Redis or similar)
const stakingMetaCache = new Map();
const CACHE_TTL = 30000; // 30 seconds cache

/**
 * Get staking history with enhanced features
 * 
 * Query Parameters:
 * - user_id: User ID (optional)
 * - per_page: Number of records per page (default: 10, max: 100)
 * - page_no: Page number (default: 1)
 * - count_for_provided_datetime_ts: Specific datetime to calculate for (optional)
 * - order: Sort order - "ASC" or "DESC" (default: "DESC")
 * - include_summary: Include staking summary in response (default: true)
 * - include_contract_status: Include contract status info (default: true)
 */
router.get('/:stakingTransactionID', async function(req, res, next) {
    try {
        const stakingTransactionID = req.params.stakingTransactionID;

        // Parse and validate query parameters
        const queryParams = parseAndValidateQueryParams(req.query);
        if (!queryParams.isValid) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: "Invalid query parameters",
                error: queryParams.errors
            });
        }

        // Get staking meta data (with caching)
        const stakingMetaData = await getStakingMetaData(stakingTransactionID);
        if (!stakingMetaData) {
            return res.status(404).send({
                status: false,
                status_code: 404,
                message: "Staking transaction not found",
                error: { stakingTransactionID }
            });
        }

        // Validate staking data
        const validation = validateStakingData({
            staking_amount: parseFloat(stakingMetaData.staking_amount),
            staking_roi_interval_payment_amount: parseFloat(stakingMetaData.staking_roi_interval_payment_amount),
            staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
            staking_roi_payment_startime_ts: parseInt(stakingMetaData.staking_roi_payment_startime_ts),
            staking_roi_payment_endtime_ts: parseInt(stakingMetaData.staking_roi_payment_endtime_ts),
            staking_roi_full_payment_amount_at_end_of_contract: parseFloat(stakingMetaData.staking_roi_full_payment_amount_at_end_of_contract)
        });

        if (!validation.isValid) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: "Invalid staking data",
                error: validation.errors
            });
        }

        // Calculate staking metrics using utils
        const stakingMetrics = calculateStakingMetricsFromMetaData(
            {
                ...stakingMetaData,
                staking_roi_amount_withdrawn_so_far: stakingMetaData.staking_roi_amount_withdrawn_so_far || 0
            },
            queryParams.count_for_provided_datetime_ts
        );

        // Validate provided datetime
        if (queryParams.count_for_provided_datetime_ts < parseInt(stakingMetaData.staking_roi_payment_startime_ts)) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: "Provided datetime is before the staking start time",
                error: { 
                    provided_datetime: queryParams.count_for_provided_datetime_ts,
                    staking_start_time: parseInt(stakingMetaData.staking_roi_payment_startime_ts)
                }
            });
        }

        // Generate ROI history data
        const roiHistoryData = generateRoiHistoryData(
            stakingMetaData, 
            stakingMetrics, 
            queryParams
        );

        // Build response
        const response = buildResponse(
            stakingMetaData, 
            stakingMetrics, 
            roiHistoryData, 
            queryParams
        );

        res.send(response);

    } catch (error) {
        console.error('Error in get-staking:', error);
        
        const errorResponse = {
            status: false,
            status_code: 500,
            message: "Internal server error",
            error: {
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };

        // Add more details for specific error types
        if (error.response) {
            errorResponse.status_code = error.response.status || 500;
            errorResponse.error.details = error.response.data;
        }

        res.status(errorResponse.status_code).send(errorResponse);
    }
});

/**
 * Parse and validate query parameters
 */
function parseAndValidateQueryParams(query) {
    const errors = [];
    
    // Parse parameters with defaults
    const params = {
        user_id: parseInt(query.user_id) || 0,
        per_page: parseInt(query.per_page) || 10,
        page_no: parseInt(query.page_no) || 1,
        count_for_provided_datetime_ts: parseInt(query.count_for_provided_datetime_ts) || Math.floor(Date.now() / 1000),
        order: (query.order || "DESC").toUpperCase(),
        include_summary: query.include_summary !== 'false',
        include_contract_status: query.include_contract_status !== 'false',
        include_withdrawal_eligibility: query.include_withdrawal_eligibility !== 'false'
    };

    // Validate parameters
    if (params.per_page < 1 || params.per_page > 100) {
        errors.push('per_page must be between 1 and 100');
    }

    if (params.page_no < 1) {
        errors.push('page_no must be greater than 0');
    }

    if (params.order !== 'ASC' && params.order !== 'DESC') {
        errors.push('order must be either "ASC" or "DESC"');
    }

    if (params.count_for_provided_datetime_ts < 0) {
        errors.push('count_for_provided_datetime_ts must be a valid timestamp');
    }

    return {
        isValid: errors.length === 0,
        errors,
        ...params
    };
}

/**
 * Get staking meta data with caching
 */
async function getStakingMetaData(stakingTransactionID) {
    const cacheKey = `staking_meta_${stakingTransactionID}`;
    const cached = stakingMetaCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }

    try {
        const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        const response = await axios.get(stakingMetaUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY
            },
            timeout: 10000 // 10 second timeout
        });

        const data = response.data.data;
        
        // Cache the result
        stakingMetaCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });

        return data;
    } catch (error) {
        console.error('Error fetching staking meta data:', error);
        return null;
    }
}

/**
 * Generate ROI history data with pagination
 */
function generateRoiHistoryData(stakingMetaData, stakingMetrics, queryParams) {
    const {
        per_page,
        page_no,
        order
    } = queryParams;

    const staking_roi_payment_interval = stakingMetaData.staking_roi_payment_interval;
    const staking_roi_payment_pattern = stakingMetaData.staking_roi_payment_pattern;
    
    // Get pattern-specific data
    let staking_roi_payment_startime_ts, staking_roi_interval_payment_amount, staking_roi_accumulation_wallet_id;
    
    if (staking_roi_payment_pattern === "internal_pattern_2") {
        staking_roi_payment_startime_ts = parseInt(stakingMetaData.staking_roi_payment_startime_ts_internal_pattern_2);
        staking_roi_interval_payment_amount = parseFloat(stakingMetaData.staking_roi_interval_payment_amount_internal_pattern_2);
        staking_roi_accumulation_wallet_id = stakingMetaData.staking_roi_payment_wallet_id_internal_pattern_2;
    } else {
        staking_roi_payment_startime_ts = parseInt(stakingMetaData.staking_roi_payment_startime_ts);
        staking_roi_interval_payment_amount = parseFloat(stakingMetaData.staking_roi_interval_payment_amount);
        staking_roi_accumulation_wallet_id = stakingMetaData.staking_roi_payment_wallet_id;
    }

    const intervalTs = TIMESTAMP_INTERVAL_VALUES[staking_roi_payment_interval].ts;
    const totalIntervals = stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_endtime;
    
    // Adjust per_page if it exceeds total data
    const adjustedPerPage = Math.min(per_page, totalIntervals);
    
    // Calculate starting interval for current page
    const startInterval = (page_no - 1) * adjustedPerPage + 1;
    const endInterval = Math.min(startInterval + adjustedPerPage - 1, totalIntervals);

    const roiHistoryData = [];

    for (let i = startInterval; i <= endInterval; i++) {
        const intervalTimestamp = staking_roi_payment_startime_ts + ((i - 1) * intervalTs);
        
        // Skip if this interval is in the future
        if (intervalTimestamp > Math.floor(Date.now() / 1000)) {
            break;
        }

        const formattedDatetime = new Date(intervalTimestamp * 1000).toLocaleString();
        // Calculate the interval label for the current entry
        // DESC: first entry is 'Second N', next is 'Second N-1', ...
        // ASC:  first entry is 'Second 1', next is 'Second 2', ...
        let paidAtCount;
        if (order === "DESC") {
            paidAtCount = totalIntervals - (i - startInterval);
        } else {
            paidAtCount = i;
        }

        const interestInfo = {
            staking_roi_accumulation_id: i,
            staking_roi_accumulation_interval: staking_roi_payment_interval,
            staking_roi_accumulation_wallet_id: staking_roi_accumulation_wallet_id,
            staking_roi_accumulation_amount: staking_roi_interval_payment_amount,
            staking_roi_accumulation_amount_formatted: `${staking_roi_accumulation_wallet_id} ${staking_roi_interval_payment_amount}`,
            staking_roi_accumulation_interval_paid_at: `${TIMESTAMP_INTERVAL_VALUES[staking_roi_payment_interval].name} ${paidAtCount}`,
            staking_roi_accumulation_datetime_ts: intervalTimestamp,
            staking_roi_accumulation_formatted_datetime: formattedDatetime,
            staking_roi_accumulation_status: "paid" // Could be "pending", "paid", "failed" in future
        };

        // Add internal pattern 2 data if applicable
        if (staking_roi_payment_pattern === "internal_pattern_2") {
            const internalPattern2WalletId = stakingMetaData.staking_roi_payment_wallet_id_internal_pattern_2;
            const internalPattern2Amount = parseFloat(stakingMetaData.staking_roi_interval_payment_amount_internal_pattern_2);
            
            interestInfo.staking_roi_accumulation_wallet_id_internal_pattern_2 = internalPattern2WalletId;
            interestInfo.staking_roi_accumulation_amount_internal_pattern_2 = internalPattern2Amount;
            interestInfo.staking_roi_accumulation_amount_formatted_internal_pattern_2 = `${internalPattern2WalletId} ${internalPattern2Amount}`;
        }

        roiHistoryData.push(interestInfo);
    }

    // Sort based on order
    if (order === "ASC") {
        roiHistoryData.sort((a, b) => a.staking_roi_accumulation_id - b.staking_roi_accumulation_id);
    } else {
        roiHistoryData.sort((a, b) => b.staking_roi_accumulation_id - a.staking_roi_accumulation_id);
        // After sorting, update the interval label for DESC
        roiHistoryData.forEach((entry, idx) => {
            entry.staking_roi_accumulation_interval_paid_at = `${TIMESTAMP_INTERVAL_VALUES[staking_roi_payment_interval].name} ${totalIntervals - ((page_no - 1) * per_page) - idx}`;
        });
    }

    return roiHistoryData;
}

/**
 * Build the complete response
 */
function buildResponse(stakingMetaData, stakingMetrics, roiHistoryData, queryParams) {
    const response = {
        status: true,
        status_code: 200,
        message: "Staking ROI Interest Retrieved Successfully",
        data: {
            roi_history: roiHistoryData
        },
        meta: {
            pagination: {
                current_page: queryParams.page_no,
                per_page: queryParams.per_page,
                total: stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_endtime,
                total_intervals: stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_endtime,
                total_pages: Math.ceil(stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_endtime / queryParams.per_page),
                last_page: Math.ceil(stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_endtime / queryParams.per_page),
                has_next_page: queryParams.page_no < Math.ceil(stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_endtime / queryParams.per_page),
                has_previous_page: queryParams.page_no > 1
            }
        }
    };

    // Include summary if requested
    if (queryParams.include_summary) {
        const staking_roi_payment_pattern = stakingMetaData.staking_roi_payment_pattern;
        
        let summaryData;
        if (staking_roi_payment_pattern === "internal_pattern_2") {
            // For pattern_2, calculate pattern-specific metrics
            const pattern2StakingAmount = parseFloat(stakingMetaData.staking_amount_internal_pattern_2);
            const pattern2IntervalPayment = parseFloat(stakingMetaData.staking_roi_interval_payment_amount_internal_pattern_2);
            const pattern2StartTime = parseInt(stakingMetaData.staking_roi_payment_startime_ts_internal_pattern_2);
            const pattern2EndTime = parseInt(stakingMetaData.staking_roi_payment_endtime_ts_internal_pattern_2);
            const pattern2WithdrawnSoFar = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0);
            const pattern2RemainingToBePaid = parseFloat(stakingMetaData.staking_roi_amount_remaining_to_be_paid_internal_pattern_2 || 0);
            const pattern2RoiFullPaymentAtEnd = parseFloat(stakingMetaData.staking_roi_full_payment_amount_at_end_of_contract_internal_pattern_2 || 0);
            const pattern2ExchangeRate = stakingMetaData.exchange_rate_at_time_of_staking_internal_pattern_2 || stakingMetaData.exchange_rate_at_time_of_staking;
            
            // Calculate pattern_2 specific accumulated_roi_now (should be 0 if all withdrawn)
            const pattern2AccumulatedRoiNow = pattern2WithdrawnSoFar + pattern2RemainingToBePaid;
            
            // Calculate pattern_2 specific end-of-contract values
            const pattern2AccumulatedTotalRoiAtEnd = pattern2RoiFullPaymentAtEnd;
            const pattern2AccumulatedTotalAmountAtEnd = pattern2StakingAmount + pattern2RoiFullPaymentAtEnd;
            
            summaryData = {
                count_number_of_staking_payment_interval_from_startime_till_now: stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_now,
                count_number_of_staking_payment_interval_from_startime_till_provided_datetime: stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_provided_datetime,
                count_number_of_staking_payment_interval_from_startime_till_endtime: stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_endtime,
                staking_amount: pattern2StakingAmount,
                staking_roi_interval_payment_amount: pattern2IntervalPayment,
                staking_roi_interval_payment_percentage: stakingMetaData.staking_roi_interval_payment_percentage_internal_pattern_2,
                staking_roi_payment_wallet_id: stakingMetaData.staking_roi_payment_wallet_id_internal_pattern_2,
                accumulated_roi_now: pattern2AccumulatedRoiNow,
                accumulated_roi_user_can_withdraw_now: pattern2RemainingToBePaid,
                accumulated_roi_user_have_already_withdraw: pattern2WithdrawnSoFar,
                accumulated_total_roi_at_end_of_staking_contract: pattern2AccumulatedTotalRoiAtEnd,
                accumulated_total_roi_and_capital_at_end_of_staking_contract: pattern2AccumulatedTotalAmountAtEnd,
                staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
                staking_roi_payment_pattern: stakingMetaData.staking_roi_payment_pattern,
                exchange_rate_at_time_of_staking: pattern2ExchangeRate,
                staking_roi_payment_startime_ts: pattern2StartTime,
                staking_roi_payment_endtime_ts: pattern2EndTime,
                can_user_withdraw_roi: pattern2RemainingToBePaid > 0,
                timestamp_retrieved_at: stakingMetrics.accumulated_timestamp_retrieved_at,
                datetime_retrieved_at: stakingMetrics.accumulated_datetime_retrieved_at
            };
            summaryData.normal_pattern = {
                staking_amount: parseFloat(stakingMetaData.staking_amount),
                staking_roi_interval_payment_amount: parseFloat(stakingMetaData.staking_roi_interval_payment_amount),
                staking_roi_interval_payment_percentage: stakingMetaData.staking_roi_interval_payment_percentage,
                staking_roi_payment_wallet_id: stakingMetaData.staking_roi_payment_wallet_id,
                accumulated_roi_now: stakingMetrics.accumulated_roi_now,
                accumulated_roi_user_can_withdraw_now: stakingMetrics.accumulated_roi_user_can_withdraw_now,
                accumulated_roi_user_have_already_withdraw: stakingMetrics.accumulated_roi_user_have_already_withdraw,
                accumulated_total_roi_at_end_of_staking_contract: stakingMetrics.accumulated_total_roi_at_end_of_staking_contract,
                accumulated_total_roi_and_capital_at_end_of_staking_contract: stakingMetrics.accumulated_total_amount_at_end_of_staking_contract,
                staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
                staking_roi_payment_pattern: stakingMetaData.staking_roi_payment_pattern,
                exchange_rate_at_time_of_staking: stakingMetaData.exchange_rate_at_time_of_staking,
                staking_roi_payment_startime_ts: parseInt(stakingMetaData.staking_roi_payment_startime_ts),
                staking_roi_payment_endtime_ts: parseInt(stakingMetaData.staking_roi_payment_endtime_ts),
                can_user_withdraw_roi: stakingMetrics.accumulated_roi_user_can_withdraw_now > 0,
                timestamp_retrieved_at: stakingMetrics.accumulated_timestamp_retrieved_at,
                datetime_retrieved_at: stakingMetrics.accumulated_datetime_retrieved_at
            };
        } else {
            const normalExchangeRate = stakingMetaData.exchange_rate_at_time_of_staking;
            summaryData = {
                count_number_of_staking_payment_interval_from_startime_till_now: stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_now,
                count_number_of_staking_payment_interval_from_startime_till_provided_datetime: stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_provided_datetime,
                count_number_of_staking_payment_interval_from_startime_till_endtime: stakingMetrics.count_number_of_staking_payment_interval_from_startime_till_endtime,
                staking_amount: parseFloat(stakingMetaData.staking_amount),
                staking_roi_interval_payment_amount: parseFloat(stakingMetaData.staking_roi_interval_payment_amount),
                staking_roi_interval_payment_percentage: stakingMetaData.staking_roi_interval_payment_percentage,
                staking_roi_payment_wallet_id: stakingMetaData.staking_roi_payment_wallet_id,
                accumulated_roi_now: stakingMetrics.accumulated_roi_now,
                accumulated_roi_user_can_withdraw_now: stakingMetrics.accumulated_roi_user_can_withdraw_now,
                accumulated_roi_user_have_already_withdraw: stakingMetrics.accumulated_roi_user_have_already_withdraw,
                accumulated_total_roi_at_end_of_staking_contract: stakingMetrics.accumulated_total_roi_at_end_of_staking_contract,
                accumulated_total_roi_and_capital_at_end_of_staking_contract: stakingMetrics.accumulated_total_amount_at_end_of_staking_contract,
                staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
                staking_roi_payment_pattern: stakingMetaData.staking_roi_payment_pattern,
                exchange_rate_at_time_of_staking: normalExchangeRate,
                staking_roi_payment_startime_ts: parseInt(stakingMetaData.staking_roi_payment_startime_ts),
                staking_roi_payment_endtime_ts: parseInt(stakingMetaData.staking_roi_payment_endtime_ts),
                can_user_withdraw_roi: stakingMetrics.accumulated_roi_user_can_withdraw_now > 0,
                timestamp_retrieved_at: stakingMetrics.accumulated_timestamp_retrieved_at,
                datetime_retrieved_at: stakingMetrics.accumulated_datetime_retrieved_at
            };
        }
        
        // Remove accumulated_total_amount_now from both patterns
        delete summaryData.accumulated_total_amount_now;
        
        response.data.summary = summaryData;
    }

    // Include contract status if requested
    if (queryParams.include_contract_status) {
        const isEnded = isStakingContractEnded(parseInt(stakingMetaData.staking_roi_payment_endtime_ts));
        const remainingTime = getRemainingStakingTime(parseInt(stakingMetaData.staking_roi_payment_endtime_ts));
        
        response.data.contract_status = {
            is_ended: isEnded,
            remaining_time_seconds: remainingTime,
            remaining_time_formatted: formatRemainingTime(remainingTime),
            progress_percentage: calculateProgressPercentage(
                parseInt(stakingMetaData.staking_roi_payment_startime_ts),
                parseInt(stakingMetaData.staking_roi_payment_endtime_ts)
            )
        };
    }

    // Remove withdrawal_eligibility section entirely
    // (No code needed, just don't add it to the response)

    return response;
}

/**
 * Format remaining time in human readable format
 */
function formatRemainingTime(seconds) {
    if (seconds <= 0) return "Expired";
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);
    
    return parts.join(' ') || "0s";
}

/**
 * Calculate progress percentage of staking contract
 */
function calculateProgressPercentage(startTime, endTime) {
    const currentTime = Math.floor(Date.now() / 1000);
    const totalDuration = endTime - startTime;
    const elapsed = currentTime - startTime;
    
    if (totalDuration <= 0) return 0;
    if (elapsed <= 0) return 0;
    if (elapsed >= totalDuration) return 100;
    
    return Math.round((elapsed / totalDuration) * 100);
}

module.exports = router; 
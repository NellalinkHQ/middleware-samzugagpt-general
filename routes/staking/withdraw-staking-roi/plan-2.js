const express = require('express');
const axios = require('axios');
const router = express.Router();

const { handleTryCatchError } = require('../../../middleware-utils/custom-try-catch-error');

// Import the new utils
const {
    getStakingROIMetrics,
    calculateStakingROIMetricsFromMetaData,
    calculateStakingROIMetricsFromMetaDataPattern2,
    validateStakingData,
    isStakingContractEnded,
    getRemainingStakingTime,
    TIMESTAMP_INTERVAL_VALUES,
    formatRemainingTime
} = require('../utils');

const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

// Simple in-memory cache for staking meta data
const stakingMetaCache = new Map();
const CACHE_TTL = 30000; // 30 seconds cache

/**
 * Plan 2 Staking ROI Withdrawal
 * 
 * Request Body:
 * - request_id: Unique request identifier
 * - user_id: User ID
 * - amount_to_withdraw: Amount to withdraw (string)
 * 
 * Headers:
 * - Authorization: Bearer JWT token
 */
router.post('/:stakingTransactionID', async function(req, res, next) {
    try {
        const stakingTransactionID = req.params.stakingTransactionID;
        const { request_id, user_id, amount_to_withdraw } = req.body;   

        // Validate authorization
        if (!req.headers.authorization) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: 'JWT Token required',
                error: { error_data: req.headers.authorization }
            });
        }
    
        const userBearerJWToken = req.headers.authorization.split(' ')[1];

        // Validate request body
        const validationResult = validateWithdrawalRequest(req.body);
        if (!validationResult.isValid) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: "Invalid request data",
                error: validationResult.errors
            });
        }

        // Get staking meta data (with caching)
        const stakingMetaData = await getStakingMetaData(stakingTransactionID, userBearerJWToken);
        if (!stakingMetaData) {
            return res.status(404).send({
                status: false,
                status_code: 404,
                message: "Plan 2 staking transaction not found",
                error: { stakingTransactionID }
            });
        }

        // Validate that this is a Plan 2 staking
        if (stakingMetaData.staking_plan_id !== 'plan_2') {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: 'This endpoint is only for Plan 2 staking transactions',
                error: {
                    staking_plan_id: stakingMetaData.staking_plan_id,
                    required_plan: 'plan_2'
                }
            });
        }

        // Check if withdrawal already exists
        const withdrawalExists = await checkWithdrawalExists(stakingTransactionID, request_id);
        if (withdrawalExists) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: `ROI withdrawal already processed for this request`,
                error: { request_id, existing_transaction: withdrawalExists }
            });
        }

        // Calculate staking metrics using utils - use pattern-specific calculation
        let stakingMetrics;
        if (stakingMetaData.staking_roi_payment_pattern === "internal_pattern_2") {
            // For pattern_2, calculate using pattern-specific fields
            const staking_roi_payment_endtime_ts = parseInt(stakingMetaData.staking_roi_payment_endtime_ts_internal_pattern_2);
            
            // For Plan 2, ROI continues until contract end (no early termination)
            stakingMetrics = calculateStakingROIMetricsFromMetaDataPattern2(stakingMetaData, staking_roi_payment_endtime_ts);
        } else {
            // For normal pattern, use standard calculation
            stakingMetrics = calculateStakingROIMetricsFromMetaData(stakingMetaData);
        }

        // Validate withdrawal amount
        const validationError = validateWithdrawalAmount(amount_to_withdraw, stakingMetrics);
        if (validationError) {
            return res.status(400).send(validationError);
        }

        // Check if ROI can be withdrawn (Plan 2 allows ROI withdrawal even after contract ends)
        if (!stakingMetrics.accumulated_roi_user_can_withdraw_now || stakingMetrics.accumulated_roi_user_can_withdraw_now <= 0) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: "No ROI available for withdrawal",
                error: {
                    available_roi: stakingMetrics.accumulated_roi_user_can_withdraw_now,
                    total_accumulated_roi: stakingMetrics.accumulated_roi_now,
                    already_withdrawn: stakingMetrics.accumulated_roi_user_have_already_withdraw,
                    staking_plan_id: stakingMetaData.staking_plan_id,
                    staking_plan_name: stakingMetaData.staking_plan_name
                }
            });
        }

        // Step 1: Debit the ROI wallet
        const debitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
        const debitRequestBody = buildRoiDebitRequestBody(request_id, user_id, amount_to_withdraw, stakingMetaData, stakingMetrics);
        
        const debitResponse = await axios.post(debitUrl, debitRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Step 2: Credit the user's main wallet
        const creditUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`;
        const creditRequestBody = buildRoiCreditRequestBody(request_id, user_id, amount_to_withdraw, stakingMetaData, stakingMetrics, debitResponse.data.data.transaction_id);
        
        const creditResponse = await axios.post(creditUrl, creditRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Step 3: Update staking meta with withdrawal information
        const currentTime = Math.floor(Date.now() / 1000);
        const updateMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        const updateMetaRequestBody = buildUpdateStakingRequestBody(stakingMetaData, amount_to_withdraw, currentTime, stakingMetrics);
        
        const updateMetaResponse = await axios.put(updateMetaUrl, updateMetaRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Success response
        return res.status(200).send({
            status: true,
            status_code: 200,
            message: 'Plan 2 Staking ROI Withdrawal Completed Successfully',
            data: {
                staking_transaction_id: stakingTransactionID,
                staking_plan_id: stakingMetaData.staking_plan_id,
                staking_plan_name: stakingMetaData.staking_plan_name,
                amount_withdrawn: amount_to_withdraw,
                roi_withdrawal_time: currentTime,
                roi_withdrawal_time_formatted: new Date(currentTime * 1000).toLocaleString(),
                debit_transaction_id: debitResponse.data.data.transaction_id,
                credit_transaction_id: creditResponse.data.data.transaction_id,
                next_roi_withdrawal_time: updateMetaRequestBody.staking_roi_next_withdrawal_duration_ts,
                next_roi_withdrawal_time_formatted: new Date(updateMetaRequestBody.staking_roi_next_withdrawal_duration_ts * 1000).toLocaleString(),
                remaining_roi: stakingMetrics.accumulated_roi_user_can_withdraw_now - parseFloat(amount_to_withdraw),
                total_accumulated_roi: stakingMetrics.accumulated_roi_now,
                note: 'Plan 2 allows ROI withdrawal every week with long-term growth accumulation.',
                processed_at: currentTime
            }
        });

    } catch (error) {
        console.error('Plan 2 ROI Withdrawal Error:', error);
        return handleTryCatchError(res, error);
    }
});

// Helper Functions

function validateWithdrawalRequest(body) {
    const errors = [];
    
    if (!body.request_id) errors.push('request_id is required');
    if (!body.user_id) errors.push('user_id is required');
    if (!body.amount_to_withdraw) errors.push('amount_to_withdraw is required');
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

function validateWithdrawalAmount(amount_to_withdraw, stakingMetrics) {
    const withdrawalAmount = parseFloat(amount_to_withdraw);
    const availableBalance = stakingMetrics.accumulated_roi_user_can_withdraw_now;
    
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
        return {
            status: false,
            status_code: 400,
            message: "Invalid withdrawal amount",
            error: { amount_to_withdraw, available_balance: availableBalance }
        };
    }
    
    if (withdrawalAmount > availableBalance) {
        return {
            status: false,
            status_code: 400,
            message: "Insufficient ROI balance for withdrawal",
            error: {
                requested_amount: withdrawalAmount,
                available_balance: availableBalance,
                remaining_after_withdrawal: availableBalance - withdrawalAmount
            }
        };
    }
    
    return null; // No validation error
}

function buildRoiDebitRequestBody(request_id, user_id, amount_to_withdraw, stakingMetaData, stakingMetrics) {
    return {
        request_id: `plan2_staking_roi_withdraw_debit_${request_id}`,
        user_id: user_id,
        amount: amount_to_withdraw,
        wallet_id: stakingMetaData.staking_roi_payment_wallet_id,
        note: `Plan 2 Staking ROI Withdrawal Debit - ${stakingMetaData.staking_plan_name}`,
        meta_data: {
            staking_transaction_id: stakingMetaData.id,
            staking_plan_id: stakingMetaData.staking_plan_id,
            staking_plan_name: stakingMetaData.staking_plan_name,
            transaction_action_type: 'plan2_staking_roi_withdrawal_debit',
            transaction_type_category: 'staking',
            transaction_external_processor: 'middleware1',
            transaction_approval_status: 'user_middleware_processed',
            transaction_approval_method: 'middleware'
        }
    };
}

function buildRoiCreditRequestBody(request_id, user_id, amount_to_withdraw, stakingMetaData, stakingMetrics) {
    // For Plan 2, use pattern-specific withdrawn amount tracking
    let withdrawnAmountSoFar;
    if (stakingMetaData.staking_roi_payment_pattern === "internal_pattern_2") {
        withdrawnAmountSoFar = stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0;
    } else {
        withdrawnAmountSoFar = stakingMetrics.accumulated_roi_user_have_already_withdraw || 0;
    }
    
    return {
        request_id: `plan2_staking_roi_withdraw_credit_${request_id}`,
        user_id: user_id,
        amount: amount_to_withdraw,
        wallet_id: stakingMetaData.staking_capital_payment_wallet_id,
        note: `Plan 2 Staking ROI Withdrawal Credit - ${stakingMetaData.staking_plan_name}`,
        meta_data: {
            staking_transaction_id: stakingMetaData.id,
            staking_plan_id: stakingMetaData.staking_plan_id,
            staking_plan_name: stakingMetaData.staking_plan_name,
            staking_roi_amount_withdrawn_so_far: parseFloat(withdrawnAmountSoFar) + parseFloat(amount_to_withdraw),
            transaction_action_type: 'plan2_staking_roi_withdrawal_credit',
            transaction_type_category: 'staking',
            transaction_external_processor: 'middleware1',
            transaction_approval_status: 'user_middleware_processed',
            transaction_approval_method: 'middleware'
        }
    };
}

function buildUpdateStakingRequestBody(stakingMetaData, amount_to_withdraw, currentTime, stakingMetrics) {
    const intervalTs = TIMESTAMP_INTERVAL_VALUES[stakingMetaData.staking_roi_withdrawal_interval].ts;
    const nextWithdrawalTime = currentTime + intervalTs;
    
    const requestBody = {
        staking_roi_next_withdrawal_duration_ts: nextWithdrawalTime,
        staking_roi_last_withdrawal_ts: currentTime
    };
    
    // Update pattern-specific fields
    if (stakingMetaData.staking_roi_payment_pattern === "internal_pattern_2") {
        const currentWithdrawn = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0);
        requestBody.staking_roi_amount_withdrawn_so_far_internal_pattern_2 = currentWithdrawn + parseFloat(amount_to_withdraw);
        requestBody.staking_roi_last_withdrawal_ts_internal_pattern_2 = currentTime;
    } else {
        const currentWithdrawn = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far || 0);
        requestBody.staking_roi_amount_withdrawn_so_far = currentWithdrawn + parseFloat(amount_to_withdraw);
    }
    
    return requestBody;
}

async function getStakingMetaData(stakingTransactionID, userBearerJWToken) {
    // Check cache first
    const cached = stakingMetaCache.get(stakingTransactionID);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    // Fetch from API
    const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
    const response = await axios.get(stakingMetaUrl, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });
    
    const data = response.data.data;
    
    // Cache the result
    stakingMetaCache.set(stakingTransactionID, {
        data: data,
        timestamp: Date.now()
    });
    
    return data;
}

async function checkWithdrawalExists(stakingTransactionID, request_id) {
    // This is a simplified check - in production, you might want to check against a database
    // For now, we'll assume no duplicate withdrawals for the same request_id
    return false;
}

module.exports = router; 
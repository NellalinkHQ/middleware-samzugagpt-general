var express = require('express');
const axios = require('axios');
var router = express.Router();

const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');

// Import the new utils
const { 
    calculateStakingMetricsFromMetaData, 
    validateStakingData,
    isStakingContractEnded,
    getRemainingStakingTime
} = require('./utils');

const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

// Simple in-memory cache for staking meta data
const stakingMetaCache = new Map();
const CACHE_TTL = 30000; // 30 seconds cache

/**
 * Enhanced Staking ROI Withdrawal
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
                message: "Staking transaction not found",
                error: { stakingTransactionID }
            });
        }

        // Check if withdrawal already exists
        const withdrawalExists = await checkWithdrawalExists(stakingTransactionID, request_id);
        if (withdrawalExists) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: `Withdrawal request already exists`,
                error: { request_id, existing_transaction: withdrawalExists }
            });
        }

        // Check if current time is at or after staking_roi_next_withdrawal_duration_ts
        const staking_roi_next_withdrawal_duration_ts = parseInt(stakingMetaData.staking_roi_next_withdrawal_duration_ts);
        const now = Math.floor(Date.now() / 1000);
        if (now < staking_roi_next_withdrawal_duration_ts) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: `You cannot withdraw ROI before the next eligible withdrawal time`,
                error: {
                    current_time: now,
                    next_withdrawal_time: staking_roi_next_withdrawal_duration_ts,
                    next_withdrawal_time_formatted: new Date(staking_roi_next_withdrawal_duration_ts * 1000).toLocaleString()
                }
            });
        }

        // Calculate staking metrics using utils
        const stakingMetrics = calculateStakingMetricsFromMetaData(stakingMetaData);
        
        // Validate staking data
        const stakingValidation = validateStakingData({
            staking_amount: parseFloat(stakingMetaData.staking_amount),
            staking_roi_interval_payment_amount: parseFloat(stakingMetaData.staking_roi_interval_payment_amount),
            staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
            staking_roi_payment_startime_ts: parseInt(stakingMetaData.staking_roi_payment_startime_ts),
            staking_roi_payment_endtime_ts: parseInt(stakingMetaData.staking_roi_payment_endtime_ts),
            staking_roi_full_payment_amount_at_end_of_contract: parseFloat(stakingMetaData.staking_roi_full_payment_amount_at_end_of_contract)
        });

        if (!stakingValidation.isValid) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: "Invalid staking data",
                error: stakingValidation.errors
            });
        }

        // Validate withdrawal amount
        const withdrawalValidation = validateWithdrawalAmount(
            parseFloat(amount_to_withdraw),
            stakingMetrics,
            stakingMetaData
        );

        if (!withdrawalValidation.isValid) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: withdrawalValidation.message,
                error: withdrawalValidation.details
            });
        }

        // Process withdrawal
        const withdrawalResult = await processWithdrawal(
            stakingTransactionID,
            request_id,
            user_id,
            parseFloat(amount_to_withdraw),
            stakingMetaData,
            stakingMetrics,
            userBearerJWToken
        );

        // Return success response
        const response = {
            status: true,
            status_code: 200,
            message: "Staking ROI Withdrawal Successful",
            data: {
                withdrawal_details: {
                    staking_transaction_id: stakingTransactionID,
                    request_id: request_id,
                    amount_withdrawn: parseFloat(amount_to_withdraw),
                    wallet_id: stakingMetaData.staking_roi_payment_wallet_id,
                    payment_pattern: stakingMetaData.staking_roi_payment_pattern
                },
                staking_metrics: stakingMetrics,
                transaction_details: withdrawalResult
            }
        };

        res.send(response);

    } catch (error) {
        console.error('Error in staking-withdraw-roi-enhanced:', error);
        handleTryCatchError(res, error);
    }
});

/**
 * Validate withdrawal request body
 */
function validateWithdrawalRequest(body) {
    const errors = [];
    const { request_id, user_id, amount_to_withdraw } = body;

    if (!request_id || typeof request_id !== 'string') {
        errors.push('request_id is required and must be a string');
    }

    if (!user_id || isNaN(parseInt(user_id))) {
        errors.push('user_id is required and must be a valid number');
    }

    if (!amount_to_withdraw || typeof amount_to_withdraw !== 'string') {
        errors.push('amount_to_withdraw is required and must be a string');
    } else {
        // Validate amount format
        if (isNaN(amount_to_withdraw) || 
            parseFloat(amount_to_withdraw) <= 0 || 
            !/^\d+(\.\d+)?$/.test(amount_to_withdraw.trim())) {
            errors.push('amount_to_withdraw must be a valid positive number (e.g., "0.1", "1", "0.001")');
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Get staking meta data with caching
 */
async function getStakingMetaData(stakingTransactionID, userBearerJWToken) {
    const cacheKey = `staking_meta_${stakingTransactionID}`;
    const cached = stakingMetaCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }

    try {
        const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        const response = await axios.get(stakingMetaUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            },
            timeout: 10000
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
 * Check if withdrawal already exists
 */
async function checkWithdrawalExists(stakingTransactionID, request_id) {
    try {
        const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        const response = await axios.get(stakingMetaUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY
            }
        });

        const existingWithdrawal = response.data.data[`staking_roi_payment_request_${request_id}`];
        return existingWithdrawal || null;
    } catch (error) {
        console.error('Error checking withdrawal existence:', error);
        return null;
    }
}

/**
 * Validate withdrawal amount
 */
function validateWithdrawalAmount(amountToWithdraw, stakingMetrics, stakingMetaData) {
    const staking_roi_payment_pattern = stakingMetaData.staking_roi_payment_pattern;
    
    // Get pattern-specific remaining and withdrawn amounts
    let staking_roi_amount_remaining_to_be_paid, staking_roi_amount_withdrawn_so_far, end_time_ts;
    
    if (staking_roi_payment_pattern === "internal_pattern_2") {
        staking_roi_amount_remaining_to_be_paid = parseFloat(stakingMetaData.staking_roi_amount_remaining_to_be_paid_internal_pattern_2 || 0);
        staking_roi_amount_withdrawn_so_far = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0);
        end_time_ts = parseInt(stakingMetaData.staking_roi_payment_endtime_ts_internal_pattern_2);
    } else {
        staking_roi_amount_remaining_to_be_paid = parseFloat(stakingMetaData.staking_roi_amount_remaining_to_be_paid || 0);
        staking_roi_amount_withdrawn_so_far = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far || 0);
        end_time_ts = parseInt(stakingMetaData.staking_roi_payment_endtime_ts);
    }

    // Check against maximum withdrawable amount
    let availableBalance;
    if (staking_roi_payment_pattern === "internal_pattern_2") {
        // For pattern_2, use the remaining amount to be paid as available balance
        availableBalance = staking_roi_amount_remaining_to_be_paid;
    } else {
        // For normal pattern, use the calculated metrics
        availableBalance = stakingMetrics.accumulated_roi_user_can_withdraw_now;
    }
    
    if (amountToWithdraw > availableBalance) {
        return {
            isValid: false,
            message: `Withdrawal amount ${amountToWithdraw} exceeds available balance ${availableBalance}`,
            details: {
                amount_to_withdraw: amountToWithdraw,
                available_balance: availableBalance,
                pattern: staking_roi_payment_pattern,
                recommendation: "Reduce withdrawal amount to available balance"
            }
        };
    }

    // Check against remaining amount to be paid
    if (amountToWithdraw > staking_roi_amount_remaining_to_be_paid) {
        return {
            isValid: false,
            message: `Withdrawal amount exceeds remaining contract amount`,
            details: {
                amount_to_withdraw: amountToWithdraw,
                remaining_contract_amount: staking_roi_amount_remaining_to_be_paid,
                recommendation: "Reduce withdrawal amount to remaining contract amount"
            }
        };
    }

    return { isValid: true };
}

/**
 * Process the withdrawal transaction
 */
async function processWithdrawal(stakingTransactionID, request_id, user_id, amountToWithdraw, stakingMetaData, stakingMetrics, userBearerJWToken) {
    const roi_credit_request_id = `staking_roi_interest_payment_${request_id}`;
    const staking_roi_payment_pattern = stakingMetaData.staking_roi_payment_pattern;
    
    // Get pattern-specific wallet ID and amounts
    let staking_roi_payment_wallet_id, staking_roi_amount_remaining_to_be_paid, staking_roi_amount_withdrawn_so_far;
    
    if (staking_roi_payment_pattern === "internal_pattern_2") {
        staking_roi_payment_wallet_id = stakingMetaData.staking_roi_payment_wallet_id_internal_pattern_2;
        staking_roi_amount_remaining_to_be_paid = parseFloat(stakingMetaData.staking_roi_amount_remaining_to_be_paid_internal_pattern_2 || 0);
        staking_roi_amount_withdrawn_so_far = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0);
    } else {
        staking_roi_payment_wallet_id = stakingMetaData.staking_roi_payment_wallet_id;
        staking_roi_amount_remaining_to_be_paid = parseFloat(stakingMetaData.staking_roi_amount_remaining_to_be_paid || 0);
        staking_roi_amount_withdrawn_so_far = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far || 0);
    }
    
    const staking_roi_amount_remaining_to_be_paid_new = staking_roi_amount_remaining_to_be_paid - amountToWithdraw;
    const staking_roi_amount_withdrawn_so_far_new = staking_roi_amount_withdrawn_so_far + amountToWithdraw;

    // Update staking transaction
    const updateStakingRequestBody = buildUpdateStakingRequestBody(
        staking_roi_payment_pattern,
        staking_roi_amount_remaining_to_be_paid_new,
        staking_roi_amount_withdrawn_so_far_new
    );

    const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
    
    const updateStakingResponse = await axios.put(stakingMetaUrl, updateStakingRequestBody, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY
        }
    });

    // Credit user wallet
    const roiCreditRequestBody = buildRoiCreditRequestBody(
        roi_credit_request_id,
        user_id,
        amountToWithdraw,
        staking_roi_payment_wallet_id,
        stakingTransactionID,
        staking_roi_payment_pattern,
        stakingMetrics,
        stakingMetaData
    );

    const roiCreditUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`;
    const roiCreditResponse = await axios.post(roiCreditUrl, roiCreditRequestBody, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });

    // Add withdrawal metadata
    const txn_payment_id = roiCreditResponse.data.data.transaction_id;
    const addMetaRequestBody = buildAddMetaRequestBody(request_id, txn_payment_id, roi_credit_request_id, amountToWithdraw);
    
    const addMetaResponse = await axios.post(stakingMetaUrl, addMetaRequestBody, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY
        }
    });

    // Clear cache for this staking transaction
    stakingMetaCache.delete(`staking_meta_${stakingTransactionID}`);

    return {
        staking_update: updateStakingResponse.data,
        credit_transaction: roiCreditResponse.data,
        meta_update: addMetaResponse.data
    };
}

/**
 * Build update staking request body
 */
function buildUpdateStakingRequestBody(staking_roi_payment_pattern, remaining_to_be_paid_new, withdrawn_so_far_new) {
    if (staking_roi_payment_pattern === "internal_pattern_2") {
        return {
            "staking_roi_amount_remaining_to_be_paid_internal_pattern_2": remaining_to_be_paid_new,
            "staking_roi_amount_withdrawn_so_far_internal_pattern_2": withdrawn_so_far_new,
            "update_staking_request_timestamp": Math.floor(Date.now() / 1000)
        };
    } else {
        return {
            "staking_roi_amount_remaining_to_be_paid": remaining_to_be_paid_new,
            "staking_roi_amount_withdrawn_so_far": withdrawn_so_far_new,
            "update_staking_request_timestamp": Math.floor(Date.now() / 1000)
        };
    }
}

/**
 * Build ROI credit request body
 */
function buildRoiCreditRequestBody(request_id, user_id, amount, wallet_id, stakingTransactionID, payment_pattern, stakingMetrics, stakingMetaData) {
    // Get pattern-specific withdrawn amount
    let accumulated_roi_user_have_already_withdraw;
    if (payment_pattern === "internal_pattern_2") {
        accumulated_roi_user_have_already_withdraw = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0);
    } else {
        accumulated_roi_user_have_already_withdraw = stakingMetrics.accumulated_roi_user_have_already_withdraw;
    }

    return {
        "request_id": request_id,
        "user_id": user_id,
        "amount": amount,
        "wallet_id": wallet_id,
        "note": "Staking ROI Interest Withdrawal",
        "meta_data": {
            "staking_parent_transaction_id": stakingTransactionID,
            "staking_roi_payment_pattern": payment_pattern,
            "accumulated_roi_user_can_withdraw_now": stakingMetrics.accumulated_roi_user_can_withdraw_now,
            "accumulated_roi_user_have_already_withdraw": accumulated_roi_user_have_already_withdraw,
            "accumulated_roi_now": stakingMetrics.accumulated_roi_now,
            "accumulated_total_amount_now": stakingMetrics.accumulated_total_amount_now,
            "accumulated_total_roi_at_end_of_staking_contract": stakingMetrics.accumulated_total_roi_at_end_of_staking_contract,
            "accumulated_total_amount_at_end_of_staking_contract": stakingMetrics.accumulated_total_amount_at_end_of_staking_contract,
            "accumulated_timestamp_retrieved_at": stakingMetrics.accumulated_timestamp_retrieved_at,
            "accumulated_datetime_retrieved_at": stakingMetrics.accumulated_datetime_retrieved_at,
            "transaction_action_type": "staking_roi_interest_payment",
            "transaction_type_category": "staking",
            "transaction_external_processor": "middleware1",
            "transaction_approval_status": "user_middleware_processed",
            "transaction_approval_method": "middleware"
        }
    };
}

/**
 * Build add meta request body
 */
function buildAddMetaRequestBody(request_id, txn_payment_id, roi_credit_request_id, amount) {
    return {
        [`staking_roi_payment_request_${request_id}`]: txn_payment_id,
        "staking_roi_payment_transaction_id": txn_payment_id,
        [`staking_roi_payment_transaction_id_payment_time_${txn_payment_id}`]: Math.floor(Date.now() / 1000),
        [`staking_roi_payment_request_id_${txn_payment_id}`]: roi_credit_request_id,
        [`staking_roi_payment_amount_${txn_payment_id}`]: amount,
        "staking_roi_payment_transaction_id_payment_time": Math.floor(Date.now() / 1000),
        "staking_roi_payment_request_id": roi_credit_request_id,
        "staking_roi_payment_amount": amount
    };
}

module.exports = router; 
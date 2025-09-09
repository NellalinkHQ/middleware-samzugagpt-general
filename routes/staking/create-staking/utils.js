const axios = require('axios');

// Environment variables
const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;
const MODULE1_STAKING_ALLOWED_WALLET_ID = process.env.MODULE1_STAKING_ALLOWED_WALLET_ID;

// Import TIMESTAMP_INTERVAL_VALUES from utils
const { TIMESTAMP_INTERVAL_VALUES } = require('../utils');

/**
 * Validate JWT token from request headers
 */
function validateJWTToken(req, res) {
    if (!req.headers.authorization) {
        return {
            error: res.status(400).send({
                status: false,
                status_code: 400,
                message: 'JWT Token required',
                error: { error_data: req.headers.authorization }
            })
        };
    }
    return { userBearerJWToken: req.headers.authorization.split(' ')[1] };
}

/**
 * Validate wallet ID against allowed wallet IDs
 */
function validateWalletId(wallet_id) {
    if (!MODULE1_STAKING_ALLOWED_WALLET_ID || MODULE1_STAKING_ALLOWED_WALLET_ID.trim() === '') {
        return { valid: true }; // No restriction if not set
    }

    const ALLOWED_WALLET_IDS = MODULE1_STAKING_ALLOWED_WALLET_ID.split(',');
    if (!ALLOWED_WALLET_IDS.includes(wallet_id)) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: "Invalid wallet_id",
                error: { error_data: wallet_id }
            }
        };
    }
    return { valid: true };
}

/**
 * Validate staking wallet ID against allowed staking wallet IDs
 */
function validateStakingWalletId(wallet_id, allowedStakingWalletIds) {
    if (!allowedStakingWalletIds || allowedStakingWalletIds.trim() === '') {
        return { valid: true }; // No restriction if not set
    }

    const ALLOWED_STAKING_WALLET_IDS = allowedStakingWalletIds.split(',');
    if (!ALLOWED_STAKING_WALLET_IDS.includes(wallet_id)) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: "Invalid Staking wallet_id",
                error: { error_data: wallet_id }
            }
        };
    }
    return { valid: true };
}

/**
 * Validate ROI payment interval
 */
function validateROIPaymentInterval(roi_payment_interval, planName = 'Staking') {
    if (!roi_payment_interval) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: `${planName} ROI payment interval is not configured`,
                error: {
                    missing_variable: "ROI_PAYMENT_INTERVAL",
                    current_value: roi_payment_interval,
                    required_values: Object.keys(TIMESTAMP_INTERVAL_VALUES)
                }
            }
        };
    }

    if (!TIMESTAMP_INTERVAL_VALUES[roi_payment_interval]) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: `Invalid ROI payment interval for ${planName}`,
                error: {
                    provided_interval: roi_payment_interval,
                    valid_intervals: Object.keys(TIMESTAMP_INTERVAL_VALUES),
                    available_keys: Object.keys(TIMESTAMP_INTERVAL_VALUES)
                }
            }
        };
    }

    return { valid: true };
}

/**
 * Check user wallet balance
 */
async function checkUserWalletBalance(user_id, wallet_id, staking_amount, userBearerJWToken) {
    const balanceCheckUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/user-wallet-balance?wallet_id=${wallet_id}&user_id=${user_id}`;
    
    const balanceResponse = await axios.get(balanceCheckUrl, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });

    const userBalance = balanceResponse.data.data.wallet_balance_raw || 0;
    
    if (userBalance < staking_amount) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: "Insufficient Balance",
                error: {
                    msg: "Staking Amount " + staking_amount + " is greater than Wallet balance " + userBalance,
                    recommendation: "Staking Amount should not be greater than Wallet balance",
                    error_data: balanceResponse.data.data
                }
            }
        };
    }

    return { valid: true, userBalance };
}

/**
 * Create debit transaction for staking
 */
async function createStakingDebitTransaction(request_id, user_id, staking_amount, wallet_id, staking_plan_name, roi_withdrawal_interval, userBearerJWToken) {
    const debitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
    const debitRequestBody = {
        "request_id": `staking_request_${request_id}`,
        "user_id": user_id,
        "amount": staking_amount,
        "wallet_id": wallet_id,
        "note": "Staking Request - " + staking_plan_name,
        "meta_data": {
            "staking_alt_request_id": `staking_locked_${request_id}`,
            "staking_roi_withdrawal_interval": roi_withdrawal_interval,
            "transaction_action_type": "staking_request",
            "transaction_type_category": "staking",
            "transaction_external_processor": "middleware1",
            "transaction_approval_status": "user_middleware_processed",
            "transaction_approval_method": "middleware"
        }
    };

    return await axios.post(debitUrl, debitRequestBody, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });
}

/**
 * Calculate staking parameters
 */
function calculateStakingParameters(staking_amount, roi_payment_percentage_of_staking_amount, roi_payment_interval, roi_payment_duration, roi_first_withdrawal_duration, staking_capital_locked_duration) {
    const staking_roi_interval_payment_percentage = roi_payment_percentage_of_staking_amount;
    const percentage = parseFloat(staking_roi_interval_payment_percentage.replace('%', ''));
    const staking_roi_interval_payment_amount = (staking_amount * percentage) / 100;
    
    const staking_roi_payment_interval = roi_payment_interval;
    const staking_count_number_of_roi_payment_interval_from_startime_till_endtime = roi_payment_duration;
    const staking_roi_payment_startime_ts = Math.floor(Date.now() / 1000);
    const staking_roi_payment_endtime_ts = staking_roi_payment_startime_ts + (staking_count_number_of_roi_payment_interval_from_startime_till_endtime * TIMESTAMP_INTERVAL_VALUES[staking_roi_payment_interval].ts);
    const staking_roi_next_withdrawal_ts = staking_roi_payment_startime_ts + (roi_first_withdrawal_duration * TIMESTAMP_INTERVAL_VALUES[roi_payment_interval].ts);
    const staking_capital_locked_duration_ts = staking_roi_payment_startime_ts + (staking_capital_locked_duration * TIMESTAMP_INTERVAL_VALUES[roi_payment_interval].ts);
    const staking_total_roi_amount_to_be_paid = staking_count_number_of_roi_payment_interval_from_startime_till_endtime * staking_roi_interval_payment_amount;
    const staking_roi_amount_remaining_to_be_paid = staking_total_roi_amount_to_be_paid;
    const staking_roi_full_payment_amount_at_end_of_contract = staking_total_roi_amount_to_be_paid;

    return {
        staking_roi_interval_payment_percentage,
        staking_roi_interval_payment_amount,
        staking_roi_payment_interval,
        staking_count_number_of_roi_payment_interval_from_startime_till_endtime,
        staking_roi_payment_startime_ts,
        staking_roi_payment_endtime_ts,
        staking_roi_next_withdrawal_ts,
        staking_capital_locked_duration,
        staking_capital_locked_duration_ts,
        staking_total_roi_amount_to_be_paid,
        staking_roi_amount_remaining_to_be_paid,
        staking_roi_full_payment_amount_at_end_of_contract
    };
}

/**
 * Build credit request body for staking
 */
function buildStakingCreditRequestBody(request_id, user_id, staking_amount, wallet_id, staking_plan_name, debitTransactionId, stakingParams, roi_payment_pattern, roi_payment_wallet_id, staking_plan_id) {
    const staking_capital_locked_duration_formatted_name = `${stakingParams.staking_capital_locked_duration} ` + TIMESTAMP_INTERVAL_VALUES[stakingParams.staking_roi_payment_interval].name_plural;
    
    const creditRequestBody = {
        "request_id": `staking_locked_${request_id}`,
        "user_id": user_id,
        "amount": staking_amount,
        "wallet_id": `${wallet_id}_staking_locked`,
        "note": "Staking Locked - " + staking_plan_name,
        "meta_data": {
            "staking_alt_request_id": `staking_request_${request_id}`,
            "staking_alt_transaction_id": debitTransactionId,
            "staking_debit_transaction_id": debitTransactionId,
            "staking_amount": staking_amount,
            "staking_roi_payment_pattern": roi_payment_pattern,
            "staking_roi_withdrawal_interval": stakingParams.staking_roi_payment_interval,
            "staking_roi_next_withdrawal_duration_ts": stakingParams.staking_roi_next_withdrawal_ts,
            "staking_capital_locked_duration": stakingParams.staking_capital_locked_duration,
            "staking_capital_locked_duration_ts": stakingParams.staking_capital_locked_duration_ts,
            "staking_capital_payment_wallet_id": `${wallet_id}`,
            "staking_plan_id": staking_plan_id,
            "staking_plan_name": staking_plan_name,
            "staking_capital_locked_duration_formatted_name": staking_capital_locked_duration_formatted_name,
            "staking_roi_payment_interval": stakingParams.staking_roi_payment_interval,
            "staking_roi_payment_startime_ts": stakingParams.staking_roi_payment_startime_ts,
            "staking_roi_payment_endtime_ts": stakingParams.staking_roi_payment_endtime_ts,
            "staking_roi_interval_payment_amount": stakingParams.staking_roi_interval_payment_amount,
            "staking_roi_interval_payment_percentage": stakingParams.staking_roi_interval_payment_percentage,
            "staking_roi_amount_remaining_to_be_paid": stakingParams.staking_roi_amount_remaining_to_be_paid,
            "staking_roi_full_payment_amount_at_end_of_contract": stakingParams.staking_roi_full_payment_amount_at_end_of_contract,
            "staking_roi_last_withdrawal_ts": 0,
            "staking_roi_amount_withdrawn_so_far": 0,
            "staking_roi_payment_wallet_id": `${wallet_id}_staking_interest`,
            "staking_count_number_of_roi_payment_interval_from_startime_till_endtime": stakingParams.staking_count_number_of_roi_payment_interval_from_startime_till_endtime,
            "transaction_action_type": "staking_locked",
            "transaction_type_category": "staking",
            "transaction_external_processor": "middleware1",
            "transaction_approval_status": "user_middleware_processed",
            "transaction_approval_method": "middleware"
        }
    };

    return creditRequestBody;
}

/**
 * Add pattern-specific metadata for internal_pattern_2
 */
function addPatternSpecificMetadata(creditRequestBody, roi_payment_pattern, stakingParams, wallet_id, roi_payment_wallet_id, exchange_rate, staking_amount) {
    if (roi_payment_pattern === "internal_pattern_2") {
        // Use the provided exchange rate instead of hardcoded environment variable
        const exchange_rate_at_time_of_staking = parseFloat(exchange_rate);
        const staking_roi_payment_wallet_id_internal_pattern_2 = `${roi_payment_wallet_id}_staking_interest`;
        
        const staking_amount_with_pattern = staking_amount * exchange_rate_at_time_of_staking;
        const staking_roi_interval_payment_amount_with_pattern = stakingParams.staking_roi_interval_payment_amount * exchange_rate_at_time_of_staking;
        const staking_roi_amount_remaining_to_be_paid_with_pattern = stakingParams.staking_roi_amount_remaining_to_be_paid * exchange_rate_at_time_of_staking;
        const staking_roi_full_payment_amount_at_end_of_contract_with_pattern = stakingParams.staking_roi_full_payment_amount_at_end_of_contract * exchange_rate_at_time_of_staking;
        
        creditRequestBody.meta_data[`staking_roi_payment_startime_ts_${roi_payment_pattern}`] = stakingParams.staking_roi_payment_startime_ts;
        creditRequestBody.meta_data[`staking_roi_payment_endtime_ts_${roi_payment_pattern}`] = stakingParams.staking_roi_payment_endtime_ts;
        creditRequestBody.meta_data[`staking_roi_interval_payment_percentage_${roi_payment_pattern}`] = stakingParams.staking_roi_interval_payment_percentage;
        creditRequestBody.meta_data[`exchange_rate_at_time_of_staking`] = exchange_rate_at_time_of_staking;
        creditRequestBody.meta_data[`exchange_rate_1_${wallet_id}_staking_locked_to_${roi_payment_wallet_id}_staking_interest_at_time_of_staking`] = exchange_rate_at_time_of_staking;
        creditRequestBody.meta_data[`staking_amount_${roi_payment_pattern}`] = staking_amount_with_pattern;
        console.log(`Setting staking_amount_${roi_payment_pattern}:`, staking_amount_with_pattern);
        creditRequestBody.meta_data[`staking_roi_interval_payment_amount_${roi_payment_pattern}`] = staking_roi_interval_payment_amount_with_pattern;
        creditRequestBody.meta_data[`staking_roi_amount_remaining_to_be_paid_${roi_payment_pattern}`] = staking_roi_amount_remaining_to_be_paid_with_pattern;
        creditRequestBody.meta_data[`staking_roi_full_payment_amount_at_end_of_contract_${roi_payment_pattern}`] = staking_roi_full_payment_amount_at_end_of_contract_with_pattern;
        creditRequestBody.meta_data[`staking_roi_last_withdrawal_ts_${roi_payment_pattern}`] = 0;
        creditRequestBody.meta_data[`staking_roi_amount_withdrawn_so_far_${roi_payment_pattern}`] = 0;
        creditRequestBody.meta_data[`staking_roi_payment_wallet_id_${roi_payment_pattern}`] = staking_roi_payment_wallet_id_internal_pattern_2;
        creditRequestBody.meta_data[`staking_count_number_of_roi_payment_interval_from_startime_till_endtime_${roi_payment_pattern}`] = stakingParams.staking_count_number_of_roi_payment_interval_from_startime_till_endtime;
    }

    return creditRequestBody;
}

/**
 * Create credit transaction for staking
 */
async function createStakingCreditTransaction(creditRequestBody, userBearerJWToken) {
    const creditUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`;
    
    return await axios.post(creditUrl, creditRequestBody, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });
}

/**
 * Build success response for staking creation
 */
function buildStakingSuccessResponse(staking_plan_id, staking_plan_name, staking_amount, roi_payment_interval, roi_payment_duration, roi_payment_percentage_of_staking_amount, staking_capital_locked_duration, staking_capital_locked_duration_formatted_name, roi_withdrawal_interval, roi_first_withdrawal_duration, stakingParams, debitTransactionId, creditTransactionId, creditResponse) {
    return {
        status: true,
        status_code: 200,
        message: "Staking Process Completed Successfully",
        data: {
            staking_plan_id: staking_plan_id,
            staking_plan_name: staking_plan_name,
            staking_amount: staking_amount,
            roi_payment_interval: roi_payment_interval,
            roi_payment_duration: roi_payment_duration,
            roi_payment_percentage: roi_payment_percentage_of_staking_amount,
            capital_locked_duration: staking_capital_locked_duration,
            capital_locked_duration_formatted: staking_capital_locked_duration_formatted_name,
            roi_withdrawal_interval: roi_withdrawal_interval,
            roi_first_withdrawal_duration: roi_first_withdrawal_duration,
            staking_roi_payment_startime_ts: stakingParams.staking_roi_payment_startime_ts,
            staking_roi_payment_endtime_ts: stakingParams.staking_roi_payment_endtime_ts,
            staking_roi_next_withdrawal_ts: stakingParams.staking_roi_next_withdrawal_ts,
            staking_capital_locked_duration_ts: stakingParams.staking_capital_locked_duration_ts,
            staking_roi_interval_payment_amount: stakingParams.staking_roi_interval_payment_amount,
            staking_total_roi_amount_to_be_paid: stakingParams.staking_total_roi_amount_to_be_paid,
            staking_roi_full_payment_amount_at_end_of_contract: stakingParams.staking_roi_full_payment_amount_at_end_of_contract,
            debit_transaction_id: debitTransactionId,
            credit_transaction_id: creditTransactionId,
            api_response: creditResponse.data
        }
    };
}

/**
 * Validate dynamic staking parameters from API data
 * @param {string} wallet_id - The wallet ID to validate
 * @param {string} staking_amount - The staking amount to validate
 * @param {Object} planData - The plan data from getStakingPlanDataFromAPI
 * @param {string} planName - The plan name for error messages
 * @returns {Object} - Validation result with error if validation fails
 */
function validateCoreStakingParameters(wallet_id, staking_amount, planData, planName) {
    // Validate supported staking wallet
    const supported_staking_wallet = planData.data.supported_staking_wallet;
    if (supported_staking_wallet) {
        const supportedWallets = supported_staking_wallet.split(',').map(wallet => wallet.trim());
        if (!supportedWallets.includes(wallet_id)) {
            return {
                error: {
                    status: false,
                    status_code: 400,
                    message: `Wallet ${wallet_id} is not supported for this staking plan. Supported wallets: ${supported_staking_wallet}`,
                    error: {
                        wallet_id: wallet_id,
                        supported_wallets: supported_staking_wallet,
                        supported_wallets_array: supportedWallets
                    }
                }
            };
        }
    }

    // Validate staking amount against dynamic limits
    const minimum_staking_amount = planData.data[`minimum_staking_amount_${wallet_id}`];
    const maximum_staking_amount = planData.data[`maximum_staking_amount_${wallet_id}`];

    if (minimum_staking_amount && parseFloat(staking_amount) < parseFloat(minimum_staking_amount)) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: `Staking amount is below minimum required for ${wallet_id}, staking amount: ${staking_amount}, minimum required: ${minimum_staking_amount}`,
                error: {
                    staking_amount: staking_amount,
                    minimum_required: minimum_staking_amount,
                    wallet_id: wallet_id
                }
            }
        };
    }

    if (maximum_staking_amount && parseFloat(staking_amount) > parseFloat(maximum_staking_amount)) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: `Staking amount exceeds maximum allowed for ${wallet_id}, staking amount: ${staking_amount}, maximum allowed: ${maximum_staking_amount}`,
                error: {
                    staking_amount: staking_amount,
                    maximum_allowed: maximum_staking_amount,
                    wallet_id: wallet_id
                }
            }
        };
    }

    // All validations passed
    return { status: true };
}

module.exports = {
    validateJWTToken,
    validateROIPaymentInterval,
    checkUserWalletBalance,
    createStakingDebitTransaction,
    calculateStakingParameters,
    buildStakingCreditRequestBody,
    addPatternSpecificMetadata,
    createStakingCreditTransaction,
    buildStakingSuccessResponse,
    validateCoreStakingParameters
};

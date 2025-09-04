var express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
var router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Import userWalletBalanceCheck middleware
const userWalletBalanceCheck = require('../../../middleware-utils/user-wallet-balance-check');
const { handleTryCatchError } = require('../../../middleware-utils/custom-try-catch-error');

// Import TIMESTAMP_INTERVAL_VALUES from utils
const { TIMESTAMP_INTERVAL_VALUES } = require('../utils');

// Environment variables for Plan 2
const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;
const MODULE1_STAKING_ALLOWED_WALLET_ID = process.env.MODULE1_STAKING_ALLOWED_WALLET_ID;
const MODULE1_STAKING_USER_JWT_SECRET_KEY = process.env.MODULE1_STAKING_USER_JWT_SECRET_KEY;
const MODULE1_STAKING_ALLOWED_DURATION = process.env.MODULE1_STAKING_ALLOWED_DURATION;
const MODULE1_STAKING_ALLOWED_PAYMENT_INTERVAL = process.env.MODULE1_STAKING_ALLOWED_PAYMENT_INTERVAL;
const MODULE1_STAKING_ALLOWED_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL = process.env.MODULE1_STAKING_ALLOWED_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
const MODULE1_STAKING_ALLOWED_PATTERN_2_ROI_PAYMENT_WALLET_ID = process.env.MODULE1_STAKING_ALLOWED_PATTERN_2_ROI_PAYMENT_WALLET_ID;

// Plan 2 specific environment variables
const MODULE1_STAKING_PLAN_2_CAPITAL_DURATION = process.env.MODULE1_STAKING_PLAN_2_CAPITAL_DURATION;
const MODULE1_STAKING_PLAN_2_ROI_PAYMENT_INTERVAL = process.env.MODULE1_STAKING_PLAN_2_ROI_PAYMENT_INTERVAL;
const MODULE1_STAKING_PLAN_2_ROI_PAYMENT_DURATION = process.env.MODULE1_STAKING_PLAN_2_ROI_PAYMENT_DURATION;
const MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL = process.env.MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
const MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PATTERN = process.env.MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PATTERN;
const MODULE1_STAKING_PLAN_2_ROI_PAYMENT_WALLET_ID = process.env.MODULE1_STAKING_PLAN_2_ROI_PAYMENT_WALLET_ID;
const MODULE1_STAKING_PLAN_2_ROI_WITHDRAWAL_INTERVAL = process.env.MODULE1_STAKING_PLAN_2_ROI_WITHDRAWAL_INTERVAL;
const MODULE1_STAKING_PLAN_2_ROI_FIRST_WITHDRAWAL_DURATION = process.env.MODULE1_STAKING_PLAN_2_ROI_FIRST_WITHDRAWAL_DURATION;

router.post('/', async function(req, res, next) {
    try {
        // Extracting data from the request body
        const { request_id, user_id, staking_amount, wallet_id } = req.body;

        // Check if Authorization is added
        if (!req.headers.authorization) {
            const response = {
                status: false,
                status_code: 400,
                message: 'JWT Token required',
                error: { error_data: req.headers.authorization }
            };
            return res.status(400).send(response);
        }
        
        // Extract JWT Bearer token from the request headers and remove the Bearer keyword
        const userBearerJWToken = req.headers.authorization.split(' ')[1];

        // Check if MODULE1_STAKING_ALLOWED_WALLET_ID is set and not empty
        if (MODULE1_STAKING_ALLOWED_WALLET_ID && MODULE1_STAKING_ALLOWED_WALLET_ID.trim() !== '') {
            const ALLOWED_WALLET_IDS = MODULE1_STAKING_ALLOWED_WALLET_ID.split(',');
            // Check if wallet_id is allowed
            if (!ALLOWED_WALLET_IDS.includes(wallet_id)) {
                const response = {
                    status: false,
                    status_code: 400,
                    message: "Invalid wallet_id",
                    error: {error_data: wallet_id}
                };
                return res.status(400).send(response);
            }
        }

        // Plan 2 Configuration (Long-Term Growth Staking)
        const staking_plan_id = "plan_2";
        const staking_plan_name = "Plan B: Long-Term Growth Staking";

        // Plan 2 specific parameters
        const roi_payment_percentage_of_staking_amount = MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
        const roi_payment_interval = MODULE1_STAKING_PLAN_2_ROI_PAYMENT_INTERVAL; 
        const roi_payment_duration = MODULE1_STAKING_PLAN_2_ROI_PAYMENT_DURATION;
        const roi_withdrawal_interval = MODULE1_STAKING_PLAN_2_ROI_WITHDRAWAL_INTERVAL;
        const roi_payment_wallet_id = MODULE1_STAKING_PLAN_2_ROI_PAYMENT_WALLET_ID;
        const roi_first_withdrawal_duration = MODULE1_STAKING_PLAN_2_ROI_FIRST_WITHDRAWAL_DURATION;
        const staking_capital_locked_duration = MODULE1_STAKING_PLAN_2_CAPITAL_DURATION; 
        const staking_capital_locked_duration_formatted_name = `${staking_capital_locked_duration} ` + TIMESTAMP_INTERVAL_VALUES[roi_payment_interval].name_plural;
        const roi_payment_pattern = MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PATTERN;

        // Check if MODULE1_STAKING_ALLOWED_PATTERN_2_ROI_PAYMENT_WALLET_ID is set and not empty
        const ALLOWED_WALLET_IDS = MODULE1_STAKING_ALLOWED_PATTERN_2_ROI_PAYMENT_WALLET_ID.split(',');
        // Check if roi_payment_wallet_id is allowed
        if (!ALLOWED_WALLET_IDS.includes(roi_payment_wallet_id)) {
            const response = {
                status: false,
                status_code: 400,
                message: "Invalid roi_payment_wallet_id",
                error: {error_data: roi_payment_wallet_id}
            };
            return res.status(400).send(response);
        }

        // Check if roi_payment_interval is within allowed range
        const allowedIntervals = MODULE1_STAKING_ALLOWED_PAYMENT_INTERVAL.split(',');
        if (!allowedIntervals.includes(roi_payment_interval)) {
            const response = {
                status: false,
                status_code: 400,
                message: "Payment Interval is not within the allowed range",
                error: {error_data: roi_payment_interval}
            };
            return res.status(400).send(response);
        }

        // Check if roi_payment_duration is within allowed range
        const allowedDurations = MODULE1_STAKING_ALLOWED_DURATION.split(',');
        if (!allowedDurations.includes(roi_payment_duration)) {
            const response = {
                status: false,
                status_code: 400,
                message: "Payment Duration is not within the allowed range",
                error: {error_data: roi_payment_duration}
            };
            return res.status(400).send(response);
        }

        // Check if roi_payment_percentage_of_staking_amount is within allowed range
        const allowedRoiPaymentPercentage = MODULE1_STAKING_ALLOWED_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL.split(',');
        if (!allowedRoiPaymentPercentage.includes(roi_payment_percentage_of_staking_amount)) {
            const response = {
                status: false,
                status_code: 400,
                message: "ROI payment percentage is not within the allowed range",
                error: { error_data: roi_payment_percentage_of_staking_amount }
            };
            return res.status(400).send(response);
        }

        // Proceed with the staking process
        // Step 1: Check balance of user
        const balanceCheckUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/user-wallet-balance?wallet_id=${wallet_id}&user_id=${user_id}`;
        
        const balanceResponse = await axios.get(balanceCheckUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Extract user balance, defaulting to 0 if null or empty
        const userBalance = balanceResponse.data.data.wallet_balance_raw || 0;
        if (userBalance < staking_amount) {
            // Insufficient balance response
            const response = {
                status: false,
                status_code: 400,
                message: "Insufficient Balance",
                error: {
                    msg: "Staking Amount "+staking_amount+" is greater than Wallet balance "+userBalance,
                    recommendation: "Staking Amount should not be greater than Wallet balance",
                    error_data: balanceResponse.data.data
                }
            };
            return res.status(400).send(response);
        }

        // Sufficient balance, proceed with staking
        // Step 2: Debit user
        const debitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
        const debitRequestBody = {
            "request_id": `staking_request_${request_id}`,
            "user_id": user_id,
            "amount": staking_amount,
            "wallet_id": wallet_id,
            "note": "Plan 2 Staking Request - Long-Term Growth Staking",
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

        const debitResponse = await axios.post(debitUrl, debitRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Calculate staking parameters
        let staking_roi_interval_payment_percentage = roi_payment_percentage_of_staking_amount;
        // Remove the percentage sign and convert to a number
        const percentage = parseFloat(staking_roi_interval_payment_percentage.replace('%', ''));

        // Calculate the staking ROI interval payment amount
        let staking_roi_interval_payment_amount = (staking_amount * percentage) / 100;
        
        let staking_roi_payment_interval = roi_payment_interval; 
        
        let staking_count_number_of_roi_payment_interval_from_startime_till_endtime = roi_payment_duration;
        let staking_roi_payment_startime_ts = Math.floor(Date.now() / 1000); // Converted to seconds
        let staking_roi_payment_endtime_ts = staking_roi_payment_startime_ts + (staking_count_number_of_roi_payment_interval_from_startime_till_endtime * TIMESTAMP_INTERVAL_VALUES[staking_roi_payment_interval].ts)
        let staking_roi_next_withdrawal_ts = staking_roi_payment_startime_ts + (roi_first_withdrawal_duration * TIMESTAMP_INTERVAL_VALUES[roi_withdrawal_interval].ts)
        let staking_capital_locked_duration_ts = staking_roi_payment_startime_ts + (staking_capital_locked_duration * TIMESTAMP_INTERVAL_VALUES[roi_payment_interval].ts)
        let staking_total_roi_amount_to_be_paid = staking_count_number_of_roi_payment_interval_from_startime_till_endtime * staking_roi_interval_payment_amount;
        let staking_roi_amount_remaining_to_be_paid = staking_total_roi_amount_to_be_paid;
        let staking_roi_full_payment_amount_at_end_of_contract = staking_total_roi_amount_to_be_paid;

        // Step 3: Credit user
        const creditUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`;
        const creditRequestBody = {
            "request_id": `staking_locked_${request_id}`,
            "user_id": user_id,
            "amount": staking_amount,
            "wallet_id": `${wallet_id}_staking_locked`,
            "note": "Plan 2 Staking Locked - Long-Term Growth Staking",
            "meta_data": {
                "staking_alt_request_id": `staking_request_${request_id}`,
                "staking_alt_transaction_id": debitResponse.data.data.transaction_id,
                "staking_debit_transaction_id": debitResponse.data.data.transaction_id,
                "staking_amount": staking_amount,
                "staking_roi_payment_pattern": roi_payment_pattern,
                "staking_roi_withdrawal_interval": roi_withdrawal_interval,
                "staking_roi_next_withdrawal_duration_ts": staking_roi_next_withdrawal_ts,
                "staking_capital_locked_duration": staking_capital_locked_duration,
                "staking_capital_locked_duration_ts": staking_capital_locked_duration_ts,
                "staking_capital_payment_wallet_id": `${wallet_id}`,

                "staking_plan_id": staking_plan_id,
                "staking_plan_name": staking_plan_name,
                "staking_capital_locked_duration_formatted_name": staking_capital_locked_duration_formatted_name,

                "staking_roi_payment_interval": staking_roi_payment_interval,
                "staking_roi_payment_startime_ts": staking_roi_payment_startime_ts,
                "staking_roi_payment_endtime_ts": staking_roi_payment_endtime_ts,
                "staking_roi_interval_payment_amount": staking_roi_interval_payment_amount,
                "staking_roi_interval_payment_percentage": staking_roi_interval_payment_percentage,
                "staking_roi_amount_remaining_to_be_paid": staking_roi_amount_remaining_to_be_paid,
                "staking_roi_full_payment_amount_at_end_of_contract": staking_roi_full_payment_amount_at_end_of_contract,
                "staking_roi_last_withdrawal_ts": 0,
                "staking_roi_amount_withdrawn_so_far": 0,
                "staking_roi_payment_wallet_id": `${wallet_id}_staking_interest`,
                "staking_count_number_of_roi_payment_interval_from_startime_till_endtime": staking_count_number_of_roi_payment_interval_from_startime_till_endtime,

                "transaction_action_type": "staking_locked",
                "transaction_type_category": "staking",
                "transaction_external_processor": "middleware1",
                "transaction_approval_status": "user_middleware_processed",
                "transaction_approval_method": "middleware"
            }
        };

        // If roi_payment_pattern is internal_pattern_2, add additional metadata properties
        if (roi_payment_pattern === "internal_pattern_2") {
            creditRequestBody.meta_data[`staking_roi_payment_startime_ts_${roi_payment_pattern}`] = staking_roi_payment_startime_ts;
            creditRequestBody.meta_data[`staking_roi_payment_endtime_ts_${roi_payment_pattern}`] = staking_roi_payment_endtime_ts;
            creditRequestBody.meta_data[`staking_roi_interval_payment_percentage_${roi_payment_pattern}`] = staking_roi_interval_payment_percentage;
            
            const MODULE1_STAKING_MAIN_WALLET_TO_ROI_PAYMENT_WALLET_EXCHANGE_RATE_TEMPORARY = parseFloat(process.env.MODULE1_STAKING_MAIN_WALLET_TO_ROI_PAYMENT_WALLET_EXCHANGE_RATE_TEMPORARY);
            
            let exchange_rate_at_time_of_staking = MODULE1_STAKING_MAIN_WALLET_TO_ROI_PAYMENT_WALLET_EXCHANGE_RATE_TEMPORARY;
            let staking_roi_payment_wallet_id_internal_pattern_2 = `${roi_payment_wallet_id}_staking_interest`;
            
            let staking_amount_with_pattern = staking_amount * exchange_rate_at_time_of_staking;
            let staking_roi_interval_payment_amount_with_pattern = staking_roi_interval_payment_amount * exchange_rate_at_time_of_staking;
            let staking_roi_amount_remaining_to_be_paid_with_pattern = staking_roi_amount_remaining_to_be_paid * exchange_rate_at_time_of_staking;
            let staking_roi_full_payment_amount_at_end_of_contract_with_pattern = staking_roi_full_payment_amount_at_end_of_contract * exchange_rate_at_time_of_staking;
            
            creditRequestBody.meta_data[`exchange_rate_at_time_of_staking`] = exchange_rate_at_time_of_staking;
            creditRequestBody.meta_data[`exchange_rate_1_${wallet_id}_staking_locked_to_${roi_payment_wallet_id}_staking_interest_at_time_of_staking`] = exchange_rate_at_time_of_staking;
            creditRequestBody.meta_data[`staking_amount_${roi_payment_pattern}`] = staking_amount_with_pattern;
            creditRequestBody.meta_data[`staking_roi_interval_payment_amount_${roi_payment_pattern}`] = staking_roi_interval_payment_amount_with_pattern;
            creditRequestBody.meta_data[`staking_roi_amount_remaining_to_be_paid_${roi_payment_pattern}`] = staking_roi_amount_remaining_to_be_paid_with_pattern;
            creditRequestBody.meta_data[`staking_roi_full_payment_amount_at_end_of_contract_${roi_payment_pattern}`] = staking_roi_full_payment_amount_at_end_of_contract_with_pattern;
            creditRequestBody.meta_data[`staking_roi_last_withdrawal_ts_${roi_payment_pattern}`] = 0;
            creditRequestBody.meta_data[`staking_roi_amount_withdrawn_so_far_${roi_payment_pattern}`] = 0;
            creditRequestBody.meta_data[`staking_roi_payment_wallet_id_${roi_payment_pattern}`] = staking_roi_payment_wallet_id_internal_pattern_2;
            creditRequestBody.meta_data[`staking_count_number_of_roi_payment_interval_from_startime_till_endtime_${roi_payment_pattern}`] = staking_count_number_of_roi_payment_interval_from_startime_till_endtime;
        }

        const creditResponse = await axios.post(creditUrl, creditRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Success response
        const response = {
            status: true,
            status_code: 200,
            message: "Plan 2 Long-Term Growth Staking Process Completed Successfully",
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
                staking_roi_payment_startime_ts: staking_roi_payment_startime_ts,
                staking_roi_payment_endtime_ts: staking_roi_payment_endtime_ts,
                staking_roi_next_withdrawal_ts: staking_roi_next_withdrawal_ts,
                staking_capital_locked_duration_ts: staking_capital_locked_duration_ts,
                staking_roi_interval_payment_amount: staking_roi_interval_payment_amount,
                staking_total_roi_amount_to_be_paid: staking_total_roi_amount_to_be_paid,
                staking_roi_full_payment_amount_at_end_of_contract: staking_roi_full_payment_amount_at_end_of_contract,
                debit_transaction_id: debitResponse.data.data.transaction_id,
                credit_transaction_id: creditResponse.data.data.transaction_id,
                api_response: creditResponse.data
            }
        };
        return res.send(response);
    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

module.exports = router; 
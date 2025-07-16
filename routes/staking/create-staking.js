var express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
var router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Import userWalletBalanceCheck middleware
const userWalletBalanceCheck = require('../../middleware-utils/user-wallet-balance-check');
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');

// Assuming you have MODULE1_STAKING_BASE_URL, MODULE1_STAKING_API_KEY, MODULE1_STAKING_ALLOWED_WALLET_ID, and MODULE1_STAKING_USER_JWT_SECRET_KEY set from ENV
const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;
const MODULE1_STAKING_ALLOWED_WALLET_ID = process.env.MODULE1_STAKING_ALLOWED_WALLET_ID;
const MODULE1_STAKING_USER_JWT_SECRET_KEY = process.env.MODULE1_STAKING_USER_JWT_SECRET_KEY;
const MODULE1_STAKING_ALLOWED_DURATION = process.env.MODULE1_STAKING_ALLOWED_DURATION;
const MODULE1_STAKING_ALLOWED_PAYMENT_INTERVAL = process.env.MODULE1_STAKING_ALLOWED_PAYMENT_INTERVAL;
const MODULE1_STAKING_ALLOWED_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL = process.env.MODULE1_STAKING_ALLOWED_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
const MODULE1_STAKING_ALLOWED_PATTERN_2_ROI_PAYMENT_WALLET_ID = process.env.MODULE1_STAKING_ALLOWED_PATTERN_2_ROI_PAYMENT_WALLET_ID;

const MODULE1_STAKING_PLAN_1_CAPITAL_DURATION = process.env.MODULE1_STAKING_PLAN_1_CAPITAL_DURATION;
const MODULE1_STAKING_PLAN_1_ROI_PAYMENT_INTERVAL = process.env.MODULE1_STAKING_PLAN_1_ROI_PAYMENT_INTERVAL;
const MODULE1_STAKING_PLAN_1_ROI_PAYMENT_DURATION = process.env.MODULE1_STAKING_PLAN_1_ROI_PAYMENT_DURATION;
const MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL = process.env.MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
const MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PATTERN = process.env.MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PATTERN;
const MODULE1_STAKING_PLAN_1_ROI_PAYMENT_WALLET_ID = process.env.MODULE1_STAKING_PLAN_1_ROI_PAYMENT_WALLET_ID;
const MODULE1_STAKING_PLAN_1_ROI_WITHDRAWAL_INTERVAL = process.env.MODULE1_STAKING_PLAN_1_ROI_WITHDRAWAL_INTERVAL;
const MODULE1_STAKING_PLAN_1_ROI_WITHDRAWAL_DURATION = process.env.MODULE1_STAKING_PLAN_1_ROI_WITHDRAWAL_DURATION;
const MODULE1_STAKING_PLAN_1_ROI_FIRST_WITHDRAWAL_DURATION = process.env.MODULE1_STAKING_PLAN_1_ROI_FIRST_WITHDRAWAL_DURATION;

const MODULE1_STAKING_PLAN_2_CAPITAL_DURATION = process.env.MODULE1_STAKING_PLAN_2_CAPITAL_DURATION;
const MODULE1_STAKING_PLAN_2_ROI_PAYMENT_INTERVAL = process.env.MODULE1_STAKING_PLAN_2_ROI_PAYMENT_INTERVAL;
const MODULE1_STAKING_PLAN_2_ROI_PAYMENT_DURATION = process.env.MODULE1_STAKING_PLAN_2_ROI_PAYMENT_DURATION;
const MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL = process.env.MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
const MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PATTERN = process.env.MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PATTERN;
const MODULE1_STAKING_PLAN_2_ROI_PAYMENT_WALLET_ID = process.env.MODULE1_STAKING_PLAN_2_ROI_PAYMENT_WALLET_ID;
const MODULE1_STAKING_PLAN_2_ROI_WITHDRAWAL_INTERVAL = process.env.MODULE1_STAKING_PLAN_2_ROI_WITHDRAWAL_INTERVAL;
const MODULE1_STAKING_PLAN_2_ROI_WITHDRAWAL_DURATION = process.env.MODULE1_STAKING_PLAN_2_ROI_WITHDRAWAL_DURATION;  
const MODULE1_STAKING_PLAN_2_ROI_FIRST_WITHDRAWAL_DURATION = process.env.MODULE1_STAKING_PLAN_2_ROI_FIRST_WITHDRAWAL_DURATION;

const MODULE1_STAKING_PLAN_3_CAPITAL_DURATION = process.env.MODULE1_STAKING_PLAN_3_CAPITAL_DURATION;
const MODULE1_STAKING_PLAN_3_ROI_PAYMENT_INTERVAL = process.env.MODULE1_STAKING_PLAN_3_ROI_PAYMENT_INTERVAL;
const MODULE1_STAKING_PLAN_3_ROI_PAYMENT_DURATION = process.env.MODULE1_STAKING_PLAN_3_ROI_PAYMENT_DURATION;
const MODULE1_STAKING_PLAN_3_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL = process.env.MODULE1_STAKING_PLAN_3_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
const MODULE1_STAKING_PLAN_3_ROI_PAYMENT_PATTERN = process.env.MODULE1_STAKING_PLAN_3_ROI_PAYMENT_PATTERN;
const MODULE1_STAKING_PLAN_3_ROI_PAYMENT_WALLET_ID = process.env.MODULE1_STAKING_PLAN_3_ROI_PAYMENT_WALLET_ID;
const MODULE1_STAKING_PLAN_3_ROI_WITHDRAWAL_INTERVAL = process.env.MODULE1_STAKING_PLAN_3_ROI_WITHDRAWAL_INTERVAL;
const MODULE1_STAKING_PLAN_3_ROI_WITHDRAWAL_DURATION = process.env.MODULE1_STAKING_PLAN_3_ROI_WITHDRAWAL_DURATION;
const MODULE1_STAKING_PLAN_3_ROI_FIRST_WITHDRAWAL_DURATION = process.env.MODULE1_STAKING_PLAN_3_ROI_FIRST_WITHDRAWAL_DURATION;




router.post('/', async function(req, res, next) {
    try {
        // Extracting data from the request body
        const { request_id, user_id, staking_amount, wallet_id, staking_id} = req.body;

        

        // Check if Authorization is added
        if (!req.headers.authorization) {
            const response = {
                status: false,
                status_code: 400,
                message: 'JWT Token required',
                error: { error_data: req.headers.authorization }
            };
            return res.status(400).send(response); // Return response if not added
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
                    error: {error_data:wallet_id}
                };
                return res.status(400).send(response);
            }
        }

        //Staking Plan

        let roi_payment_interval, roi_payment_duration, roi_payment_percentage_of_staking_amount, roi_payment_pattern, roi_payment_wallet_id ;
        if(staking_id=="plan_1"){

            roi_payment_percentage_of_staking_amount = MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
            roi_payment_interval = MODULE1_STAKING_PLAN_1_ROI_PAYMENT_INTERVAL; 
            roi_payment_duration = MODULE1_STAKING_PLAN_1_ROI_PAYMENT_DURATION; // duration for stake maturity and withdrawal 
            roi_withdrawal_interval = MODULE1_STAKING_PLAN_1_ROI_WITHDRAWAL_INTERVAL; // duration for stake maturity and withdrawal 
            roi_payment_wallet_id = MODULE1_STAKING_PLAN_1_ROI_PAYMENT_WALLET_ID;
            roi_first_withdrawal_duration =  MODULE1_STAKING_PLAN_1_ROI_FIRST_WITHDRAWAL_DURATION; 
            staking_capital_locked_duration = MODULE1_STAKING_PLAN_1_CAPITAL_DURATION; // 2 minutes 
            roi_payment_pattern = MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PATTERN;

        }  
        
        else if(staking_id=="plan_2"){

            roi_payment_percentage_of_staking_amount = MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
            roi_payment_interval = MODULE1_STAKING_PLAN_2_ROI_PAYMENT_INTERVAL; 
            roi_payment_duration = MODULE1_STAKING_PLAN_2_ROI_PAYMENT_DURATION; // duration for stake maturity and withdrawal 
            roi_withdrawal_interval = MODULE1_STAKING_PLAN_2_ROI_WITHDRAWAL_INTERVAL; // duration for stake maturity and withdrawal 
            roi_payment_wallet_id = MODULE1_STAKING_PLAN_2_ROI_PAYMENT_WALLET_ID;
            roi_first_withdrawal_duration = MODULE1_STAKING_PLAN_2_ROI_FIRST_WITHDRAWAL_DURATION;
            staking_capital_locked_duration = MODULE1_STAKING_PLAN_2_CAPITAL_DURATION; // 5 minutes
            roi_payment_pattern = MODULE1_STAKING_PLAN_2_ROI_PAYMENT_PATTERN;

        }
        else if(staking_id=="plan_3"){

            roi_payment_percentage_of_staking_amount = MODULE1_STAKING_PLAN_3_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
            roi_payment_interval = MODULE1_STAKING_PLAN_3_ROI_PAYMENT_INTERVAL; 
            roi_payment_duration = MODULE1_STAKING_PLAN_3_ROI_PAYMENT_DURATION; // duration for stake maturity and withdrawal 
            roi_withdrawal_interval = MODULE1_STAKING_PLAN_3_ROI_WITHDRAWAL_INTERVAL; // duration for stake maturity and withdrawal 
            roi_payment_wallet_id = MODULE1_STAKING_PLAN_3_ROI_PAYMENT_WALLET_ID;
            roi_first_withdrawal_duration = MODULE1_STAKING_PLAN_3_ROI_FIRST_WITHDRAWAL_DURATION;
            staking_capital_locked_duration = MODULE1_STAKING_PLAN_3_CAPITAL_DURATION; // 10 minutes
            roi_payment_pattern = MODULE1_STAKING_PLAN_3_ROI_PAYMENT_PATTERN;
            

        }
        else if(staking_id=="plan_4"){

            roi_payment_percentage_of_staking_amount =  "0.03%"
            roi_payment_interval = "every_second"; 
            roi_payment_duration = "5"; // duration for stake maturity and withdrawal 
            roi_withdrawal_interval = "every_minute"; // duration for stake maturity and withdrawal 
            roi_payment_pattern = "internal_pattern_2";
            roi_payment_wallet_id = "usdt";
            staking_capital_locked_duration = 10 * 60 * 1000; // 10 minutes

        }
        else{

            const response = {
                status: false,
                status_code: 400,
                message: 'Unknown Staking Plan',
                error: { error_data: staking_id}
            };
            return res.status(400).send(response); // Return response if not added

        }


        // Check if MODULE1_STAKING_ALLOWED_PATTERN_2_ROI_PAYMENT_WALLET_ID is set and not empty
        const ALLOWED_WALLET_IDS = process.env.MODULE1_STAKING_ALLOWED_PATTERN_2_ROI_PAYMENT_WALLET_ID.split(',');
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
                'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
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
                error: {msg: "Staking Amount "+staking_amount+" is greater than Wallet balance "+userBalance,
                        recommendation: "Staking Amount should not be greater than Wallet balance",
                        error_data:balanceResponse.data.data
                        }
            };
            return res.status(400).send(response);
        }

        // Sufficient balance, proceed with staking
        // Step 3: Debit user
        const debitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
        const debitRequestBody = {
            "request_id": `staking_request_${request_id}`,
            "user_id": user_id,
            "amount": staking_amount,
            "wallet_id": wallet_id,
            "note": "Staking Request",
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
                'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
            }
        });


        const timestamp_interval_values = {
              every_second: { ts: 1, name: "Second", name_repetition: "Every Second" },
              every_minute: { ts: 60, name: "Minute", name_repetition: "Every Minute" },
              every_hour: { ts: 3600, name: "Hour", name_repetition: "Every Hour" },
              every_day: { ts: 86400, name: "Day", name_repetition: "Daily" },
              every_week: { ts: 604800, name: "Week", name_repetition: "Weekly" },
              every_month: { ts: 2592000, name: "Month", name_repetition: "Monthly" },
              every_year: { ts: 31536000, name: "Year", name_repetition: "Yearly" }
            };

        let staking_roi_interval_payment_percentage = roi_payment_percentage_of_staking_amount;
        // Remove the percentage sign and convert to a number
        const percentage = parseFloat(staking_roi_interval_payment_percentage.replace('%', ''));

        // Calculate the staking ROI interval payment amount
        let staking_roi_interval_payment_amount = (staking_amount * percentage) / 100;


        let staking_roi_payment_interval = roi_payment_interval; 
        
        let staking_count_number_of_roi_payment_interval_from_startime_till_endtime = roi_payment_duration;
        let staking_roi_payment_startime_ts = Math.floor(Date.now() / 1000); // Converted to seconds
        let staking_roi_payment_endtime_ts = staking_roi_payment_startime_ts + (staking_count_number_of_roi_payment_interval_from_startime_till_endtime * timestamp_interval_values[staking_roi_payment_interval].ts)
        let staking_roi_first_withdrawal_ts = staking_roi_payment_startime_ts + (roi_first_withdrawal_duration * timestamp_interval_values[staking_roi_payment_interval].ts)
        let staking_total_roi_amount_to_be_paid = staking_count_number_of_roi_payment_interval_from_startime_till_endtime * staking_roi_interval_payment_amount;
        let staking_roi_amount_remaining_to_be_paid = staking_total_roi_amount_to_be_paid;
        let staking_roi_full_payment_amount_at_end_of_contract = staking_total_roi_amount_to_be_paid;


        // Step 4: Credit user
        const creditUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`;
        const creditRequestBody = {
            "request_id": `staking_locked_${request_id}`,
            "user_id": user_id,
            "amount": staking_amount,
            "wallet_id": `${wallet_id}_staking_locked`,
            "note": "Staking Locked",
            "meta_data": {
                "staking_alt_request_id": `staking_request_${request_id}`,
                "staking_alt_transaction_id": debitResponse.data.data.transaction_id,
                "staking_debit_transaction_id": debitResponse.data.data.transaction_id,
                "staking_amount": staking_amount,
                "staking_roi_payment_pattern": roi_payment_pattern,//can be internal_pattern_1 or internal_pattern_2 or external_pattern_1 or external_pattern_johndoeprovider
               
                "staking_roi_withdrawal_interval": roi_withdrawal_interval,
                "staking_roi_first_withdrawal_duration": staking_roi_first_withdrawal_ts,
                "staking_capital_locked_duration": staking_capital_locked_duration,
                "staking_capital_payment_wallet_id": `${wallet_id}`,

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
                'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
            }
        });

        // Success response
        const response = {
            status: true,
            status_code: 200,
            message: "Staking Process Completed Successfully",
            data: creditResponse.data // Assuming creditResponse contains relevant data
        };
        return res.send(response);
    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

module.exports = router;

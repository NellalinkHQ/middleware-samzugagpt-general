var express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
var router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Import userWalletBalanceCheck middleware
const userWalletBalanceCheck = require('../../../middleware-utils/user-wallet-balance-check');
const { handleTryCatchError } = require('../../../middleware-utils/custom-try-catch-error');

// Import utility functions
const { 
    calculateStakingParameters,
    buildStakingCreditRequestBody,
    addPatternSpecificMetadata,
    createStakingCreditTransaction,
    validateCoreStakingParameters
} = require('./utils');

// Import TIMESTAMP_INTERVAL_VALUES from main utils
const { TIMESTAMP_INTERVAL_VALUES } = require('../utils');
const { getStakingPlanDataFromAPI } = require('../get-staking/utils');

// Environment variables for Plan 1
const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;
const MODULE1_STAKING_ALLOWED_WALLET_ID = process.env.MODULE1_STAKING_ALLOWED_WALLET_ID;
const MODULE1_STAKING_USER_JWT_SECRET_KEY = process.env.MODULE1_STAKING_USER_JWT_SECRET_KEY;
const MODULE1_STAKING_ALLOWED_DURATION = process.env.MODULE1_STAKING_ALLOWED_DURATION;
const MODULE1_STAKING_ALLOWED_PAYMENT_INTERVAL = process.env.MODULE1_STAKING_ALLOWED_PAYMENT_INTERVAL;
const MODULE1_STAKING_ALLOWED_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL = process.env.MODULE1_STAKING_ALLOWED_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
const MODULE1_STAKING_ALLOWED_PATTERN_2_ROI_PAYMENT_WALLET_ID = process.env.MODULE1_STAKING_ALLOWED_PATTERN_2_ROI_PAYMENT_WALLET_ID;

// Plan 1 specific environment variables
const MODULE1_STAKING_PLAN_1_CAPITAL_DURATION = process.env.MODULE1_STAKING_PLAN_1_CAPITAL_DURATION;
const MODULE1_STAKING_PLAN_1_ROI_PAYMENT_INTERVAL = process.env.MODULE1_STAKING_PLAN_1_ROI_PAYMENT_INTERVAL;
const MODULE1_STAKING_PLAN_1_ROI_PAYMENT_DURATION = process.env.MODULE1_STAKING_PLAN_1_ROI_PAYMENT_DURATION;
const MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL = process.env.MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
const MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PATTERN = process.env.MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PATTERN;
const MODULE1_STAKING_PLAN_1_ROI_PAYMENT_WALLET_ID = process.env.MODULE1_STAKING_PLAN_1_ROI_PAYMENT_WALLET_ID;
const MODULE1_STAKING_PLAN_1_ROI_WITHDRAWAL_INTERVAL = process.env.MODULE1_STAKING_PLAN_1_ROI_WITHDRAWAL_INTERVAL;
const MODULE1_STAKING_PLAN_1_ROI_FIRST_WITHDRAWAL_DURATION = process.env.MODULE1_STAKING_PLAN_1_ROI_FIRST_WITHDRAWAL_DURATION;

// Plan 1 name constant
const MODULE1_STAKING_PLAN_1_NAME = process.env.MODULE1_STAKING_PLAN_1_NAME || 'Plan A : Basic Staking';

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

        // Plan 1 Configuration
        const staking_plan_id = "plan_1";
        const staking_plan_name = MODULE1_STAKING_PLAN_1_NAME;

        // Get dynamic staking limits for the specific wallet
        const planData = await getStakingPlanDataFromAPI('plan_1');
        if (!planData.status) {
            return res.status(400).json(planData.error);
        }

        // Validate function like min and max staking amount using utility function
        const coreStakingValidation = validateCoreStakingParameters(wallet_id, staking_amount, planData, MODULE1_STAKING_PLAN_1_NAME);
        if (coreStakingValidation.error) {
            return res.status(400).send(coreStakingValidation.error);
        }

        // Plan 1 specific parameters
        const roi_payment_percentage_of_staking_amount = MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
        const roi_payment_interval = MODULE1_STAKING_PLAN_1_ROI_PAYMENT_INTERVAL; 
        const roi_payment_duration = MODULE1_STAKING_PLAN_1_ROI_PAYMENT_DURATION;
        const roi_withdrawal_interval = MODULE1_STAKING_PLAN_1_ROI_WITHDRAWAL_INTERVAL;
        const roi_payment_wallet_id = MODULE1_STAKING_PLAN_1_ROI_PAYMENT_WALLET_ID;
        const roi_first_withdrawal_duration = MODULE1_STAKING_PLAN_1_ROI_FIRST_WITHDRAWAL_DURATION;
        const staking_capital_locked_duration = MODULE1_STAKING_PLAN_1_CAPITAL_DURATION; 
        const staking_capital_locked_duration_formatted_name = `${staking_capital_locked_duration} ` + TIMESTAMP_INTERVAL_VALUES[roi_payment_interval].name_plural;
        const roi_payment_pattern = MODULE1_STAKING_PLAN_1_ROI_PAYMENT_PATTERN;

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
            const response = {
                status: false,
                status_code: 400,
                message: "Insufficient balance",
                error: {
                    user_balance: userBalance,
                    staking_amount: staking_amount,
                    wallet_id: wallet_id
                }
            };
            return res.status(400).send(response);
        }

        // Step 2: Debit user
        const debitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
        const debitRequestBody = {
            "request_id": `staking_request_${request_id}`,
            "user_id": user_id,
            "amount": staking_amount,
            "wallet_id": wallet_id,
            "note": "Staking Request",
            "meta_data": {
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
        const stakingParams = calculateStakingParameters(
            staking_amount,
            roi_payment_percentage_of_staking_amount,
            roi_payment_interval,
            roi_payment_duration,
            roi_first_withdrawal_duration,
            staking_capital_locked_duration
        );

        // Step 3: Build credit request body
        let creditRequestBody = buildStakingCreditRequestBody(
            request_id,
            user_id,
            staking_amount,
            wallet_id,
            staking_plan_name,
            debitResponse.data.data.transaction_id,
            stakingParams,
            roi_payment_pattern,
            roi_payment_wallet_id,
            staking_plan_id
        );

        // Add Plan 1 specific meta fields (standard behavior)
        creditRequestBody.meta_data.stop_roi_after_capital_withdrawal = "no";
        creditRequestBody.meta_data.instant_capital_withdrawal = "no";

        // Add pattern-specific metadata if needed
        const exchange_rate_at_time_of_staking = planData.data[`exchange_rate_${wallet_id}_to_usdt_staking_interest`];
        creditRequestBody = addPatternSpecificMetadata(
            creditRequestBody,
            roi_payment_pattern,
            stakingParams,
            wallet_id,
            roi_payment_wallet_id,
            exchange_rate_at_time_of_staking,
            staking_amount
        );

        // Step 4: Create credit transaction
        const creditResponse = await createStakingCreditTransaction(creditRequestBody, userBearerJWToken);

        // Success response
        const response = {
            status: true,
            status_code: 200,
            message: "Staking Created Successfully",
            data: {
                staking_transaction_id: creditResponse.data.data.transaction_id,
                staking_request_id: request_id,
                staking_amount: staking_amount,
                staking_plan_id: staking_plan_id,
                staking_plan_name: staking_plan_name,
                staking_wallet_id: `${wallet_id}_staking_locked`,
                staking_roi_payment_wallet_id: `${wallet_id}_staking_interest`,
                staking_roi_payment_pattern: roi_payment_pattern,
                staking_roi_payment_interval: roi_payment_interval,
                staking_roi_payment_duration: roi_payment_duration,
                staking_roi_interval_payment_amount: stakingParams.staking_roi_interval_payment_amount,
                staking_roi_interval_payment_percentage: stakingParams.staking_roi_interval_payment_percentage,
                staking_roi_full_payment_amount_at_end_of_contract: stakingParams.staking_roi_full_payment_amount_at_end_of_contract,
                staking_capital_locked_duration: staking_capital_locked_duration,
                staking_capital_locked_duration_formatted_name: staking_capital_locked_duration_formatted_name,
                staking_roi_next_withdrawal_duration_ts: stakingParams.staking_roi_next_withdrawal_ts,
                staking_roi_payment_startime_ts: stakingParams.staking_roi_payment_startime_ts,
                staking_roi_payment_endtime_ts: stakingParams.staking_roi_payment_endtime_ts,
                debit_transaction_id: debitResponse.data.data.transaction_id,
                credit_transaction_id: creditResponse.data.data.transaction_id
            }
        };

        res.send(response);

    } catch (error) {
        handleTryCatchError(res, error);
    }
});

module.exports = router;

var express = require('express');
var router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Import userWalletBalanceCheck middleware
const userWalletBalanceCheck = require('../../../middleware-utils/user-wallet-balance-check');
const { handleTryCatchError } = require('../../../middleware-utils/custom-try-catch-error');

// Import shared utilities
const {
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
} = require('./utils');

// Import TIMESTAMP_INTERVAL_VALUES from utils
const { TIMESTAMP_INTERVAL_VALUES } = require('../utils');

// Import get-staking utils for dynamic validation
const { getStakingPlanDataFromAPI } = require('../get-staking/utils');

// Environment variables for Plan 4
const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;
const MODULE1_STAKING_PLAN_4_NAME = process.env.MODULE1_STAKING_PLAN_4_NAME || 'Plan 4';
const MODULE1_STAKING_ALLOWED_WALLET_ID = process.env.MODULE1_STAKING_ALLOWED_WALLET_ID;

// Plan 4 specific environment variables
const MODULE1_STAKING_PLAN_4_CAPITAL_DURATION = process.env.MODULE1_STAKING_PLAN_4_CAPITAL_DURATION;
const MODULE1_STAKING_PLAN_4_ROI_PAYMENT_INTERVAL = process.env.MODULE1_STAKING_PLAN_4_ROI_PAYMENT_INTERVAL;
const MODULE1_STAKING_PLAN_4_ROI_PAYMENT_DURATION = process.env.MODULE1_STAKING_PLAN_4_ROI_PAYMENT_DURATION;
const MODULE1_STAKING_PLAN_4_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL = process.env.MODULE1_STAKING_PLAN_4_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
const MODULE1_STAKING_PLAN_4_ROI_PAYMENT_PATTERN = process.env.MODULE1_STAKING_PLAN_4_ROI_PAYMENT_PATTERN;
const MODULE1_STAKING_PLAN_4_ROI_PAYMENT_WALLET_ID = process.env.MODULE1_STAKING_PLAN_4_ROI_PAYMENT_WALLET_ID;
const MODULE1_STAKING_PLAN_4_ROI_WITHDRAWAL_INTERVAL = process.env.MODULE1_STAKING_PLAN_4_ROI_WITHDRAWAL_INTERVAL;
const MODULE1_STAKING_PLAN_4_ROI_FIRST_WITHDRAWAL_DURATION = process.env.MODULE1_STAKING_PLAN_4_ROI_FIRST_WITHDRAWAL_DURATION;
const MODULE1_STAKING_PLAN_4_ALLOWED_STAKING_WALLET_ID = process.env.MODULE1_STAKING_PLAN_4_ALLOWED_STAKING_WALLET_ID;

router.post('/', async function(req, res, next) {
    try {
        // Extracting data from the request body
        const { request_id, user_id, staking_amount, wallet_id } = req.body;

        // Validate JWT token
        const jwtValidation = validateJWTToken(req, res);
        if (jwtValidation.error) return jwtValidation.error;
        const { userBearerJWToken } = jwtValidation;

        // Use TIMESTAMP_INTERVAL_VALUES imported from utils.js

        // Plan 4 Configuration (Ultra-Fast Staking)
        const staking_plan_id = "plan_4";
        const staking_plan_name = MODULE1_STAKING_PLAN_4_NAME;

        // Plan 4 specific parameters
        const roi_payment_percentage_of_staking_amount = MODULE1_STAKING_PLAN_4_ROI_PAYMENT_PERCENTAGE_OF_STAKING_AMOUNT_PER_INTERVAL;
        const roi_payment_interval = MODULE1_STAKING_PLAN_4_ROI_PAYMENT_INTERVAL; 
        const roi_payment_duration = MODULE1_STAKING_PLAN_4_ROI_PAYMENT_DURATION;
        const roi_withdrawal_interval = MODULE1_STAKING_PLAN_4_ROI_WITHDRAWAL_INTERVAL;
        const roi_payment_wallet_id = MODULE1_STAKING_PLAN_4_ROI_PAYMENT_WALLET_ID;
        const roi_first_withdrawal_duration = MODULE1_STAKING_PLAN_4_ROI_FIRST_WITHDRAWAL_DURATION;
        const staking_capital_locked_duration = MODULE1_STAKING_PLAN_4_CAPITAL_DURATION; 
        
        // Validate ROI payment interval
        const intervalValidation = validateROIPaymentInterval(roi_payment_interval, staking_plan_name);
        if (intervalValidation.error) {
            return res.status(400).send(intervalValidation.error);
        }

        const staking_capital_locked_duration_formatted_name = `${staking_capital_locked_duration} ` + TIMESTAMP_INTERVAL_VALUES[roi_payment_interval].name_plural;
        const roi_payment_pattern = MODULE1_STAKING_PLAN_4_ROI_PAYMENT_PATTERN;

        // Get dynamic staking limits for the specific wallet
        const planData = await getStakingPlanDataFromAPI('plan_4');
        if (!planData.status) {
            return res.status(400).json(planData.error);
        }

        // Validate function like min and max staking amount using utility function
        const coreStakingValidation = validateCoreStakingParameters(wallet_id, staking_amount, planData, MODULE1_STAKING_PLAN_4_NAME);
        if (coreStakingValidation.error) {
            return res.status(400).send(coreStakingValidation.error);
        }

        // Proceed with the staking process
        // Step 1: Check balance of user
        const balanceValidation = await checkUserWalletBalance(user_id, wallet_id, staking_amount, userBearerJWToken);
        if (balanceValidation.error) {
            return res.status(400).send(balanceValidation.error);
        }

        // Step 2: Create debit transaction
        const debitResponse = await createStakingDebitTransaction(
            request_id, 
            user_id, 
            staking_amount, 
            wallet_id, 
            staking_plan_name, 
            roi_withdrawal_interval, 
            userBearerJWToken
        );

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

        // Add Plan 4 specific meta fields
        creditRequestBody.meta_data.stop_roi_after_capital_withdrawal = "yes";
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
        const response = buildStakingSuccessResponse(
            staking_plan_id,
            staking_plan_name,
            staking_amount,
            roi_payment_interval,
            roi_payment_duration,
            roi_payment_percentage_of_staking_amount,
            staking_capital_locked_duration,
            staking_capital_locked_duration_formatted_name,
            roi_withdrawal_interval,
            roi_first_withdrawal_duration,
            stakingParams,
            debitResponse.data.data.transaction_id,
            creditResponse.data.data.transaction_id,
            creditResponse
        );
        return res.send(response);
    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

module.exports = router; 
const express = require('express');
const router = express.Router();

const { handleTryCatchError } = require('../../../middleware-utils/custom-try-catch-error');

// Import shared utilities
const {
    validateJWTToken,
    validateBlockchainWithdrawalAddress,
    fetchAndValidateStakingMeta,
    validateStakingPlan,
    validateWithdrawalRequest,
    validateRoiWithdrawalTiming,
    validateWithdrawalAmount,
    checkWithdrawalExists,
    checkInternalRoiWithdrawn,
    checkExternalWithdrawalExists,
    checkPendingTransactions,
    buildRoiDebitRequestBody,
    buildRoiCreditRequestBody,
    buildUpdateStakingRequestBody,
    createDebitTransaction,
    createCreditTransaction,
    updateStakingMeta,
    updateUserPendingTransactionStatus,
    buildExternalWithdrawalDebitRequestBody,
    buildRoiWithdrawalSuccessResponse,
    buildInternalRoiWithdrawalBlockedError,
    buildExternalRoiWithdrawalExistsError,
    buildPendingTransactionError,
    buildInsufficientRoiBalanceError,
    invalidateStakingMetaCache,
    checkUserFeeBalance,
    deductUserFee,
    creditFeeToFeeUser
} = require('./utils');

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

const MODULE1_STAKING_PLAN_5_NAME = process.env.MODULE1_STAKING_PLAN_5_NAME || 'Plan 5';

// Import get-staking utils for dynamic fee configuration
const { getStakingPlanDataFromAPI } = require('../get-staking/utils');

/**
 * ${MODULE1_STAKING_PLAN_5_NAME} Staking ROI Withdrawal
 * Internal withdrawal to user's main wallet
 */
router.post('/:stakingTransactionID', async (req, res) => {
    try {
        const stakingTransactionID = req.params.stakingTransactionID;
        const { request_id, user_id, amount_to_withdraw } = req.body;

        // Validate JWT token
        const jwtValidation = validateJWTToken(req, res);
        if (jwtValidation.error) return jwtValidation.error;
        const { userBearerJWToken } = jwtValidation;

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

        // Fetch and validate staking meta data
        const stakingMetaData = await fetchAndValidateStakingMeta(stakingTransactionID, userBearerJWToken);

        // Validate Plan 5 staking
        const plan5Validation = validateStakingPlan(stakingMetaData, "plan_5");
        if (plan5Validation.error) return res.status(400).json(plan5Validation.error);

        // Calculate staking metrics using utils - use pattern-specific calculation
        let stakingMetrics;
        if (stakingMetaData.staking_roi_payment_pattern === "internal_pattern_2") {
            // For pattern_2, calculate using pattern-specific fields
            const staking_roi_payment_endtime_ts = parseInt(stakingMetaData.staking_roi_payment_endtime_ts_internal_pattern_2);
            
            // For Plan 5, if capital has been withdrawn, use the capital withdrawal time as the effective end time
            const stakingPlanId = stakingMetaData.staking_plan_id;
            const capitalWithdrawnAt = parseInt(stakingMetaData.staking_capital_withdrawn_at);
            let effectiveEndTime = staking_roi_payment_endtime_ts;
            
            if (stakingPlanId === 'plan_5' && capitalWithdrawnAt && capitalWithdrawnAt > 0) {
                // For Plan 5 with capital withdrawn, ROI stops at capital withdrawal time
                effectiveEndTime = Math.min(staking_roi_payment_endtime_ts, capitalWithdrawnAt);
            }
            
            stakingMetrics = calculateStakingROIMetricsFromMetaDataPattern2(stakingMetaData, effectiveEndTime);
        } else {
            // For normal pattern, use standard calculation
            stakingMetrics = calculateStakingROIMetricsFromMetaData(stakingMetaData);
        }

        // 1. Check if transaction with request id exists, tell the user it exists if it exists
        const withdrawalExists = await checkWithdrawalExists(stakingTransactionID, request_id);
        if (withdrawalExists) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: `ROI withdrawal already processed for this request`,
                error: { request_id, existing_transaction: withdrawalExists }
            });
        }

        // 2. Check for ROI Eligible time
        const timingValidation = validateRoiWithdrawalTiming(stakingMetaData);
        if (timingValidation.error) {
            return res.status(400).send(timingValidation.error);
        }

        // 3. Check if user ROI balance is enough, if not throw error
        if (!stakingMetrics.accumulated_roi_user_can_withdraw_now || stakingMetrics.accumulated_roi_user_can_withdraw_now <= 0) {
            const insufficientBalanceError = buildInsufficientRoiBalanceError(stakingMetrics, stakingMetaData);
            return res.status(400).send(insufficientBalanceError);
        }

        // 4. Validate withdrawal amount
        const validationError = validateWithdrawalAmount(amount_to_withdraw, stakingMetrics);
        if (validationError) {
            return res.status(400).send(validationError);
        }

        // Get dynamic fee configuration for internal ROI withdrawal
        const planData = await getStakingPlanDataFromAPI('plan_5');
        if (!planData.status) {
            return res.status(400).json(planData.error);
        }

        const fee_amount = planData.data.roi_withdrawal_fee_internal;
        const fee_wallet = planData.data.roi_withdrawal_fee_wallet;
        
        // Skip fee processing if fee is zero
        if (parseFloat(fee_amount) > 0) {
            // Check if user has sufficient balance for fee
            const feeBalanceCheck = await checkUserFeeBalance(userBearerJWToken, fee_amount, fee_wallet, user_id);
            if (!feeBalanceCheck.status) {
                return res.status(400).json(feeBalanceCheck.error);
            }

            // Deduct the fee
            const feeDeduction = await deductUserFee(userBearerJWToken, fee_amount, fee_wallet, user_id, stakingTransactionID);
            if (!feeDeduction.status) {
                return res.status(400).json(feeDeduction.error);
            }

            // Credit the fee to fee user 
            const feeCredit = await creditFeeToFeeUser(userBearerJWToken, fee_amount, fee_wallet, stakingTransactionID, user_id);
            if (!feeCredit.status) {
                return res.status(400).json(feeCredit.error);
            }
        }

        // Step 1: Debit the ROI amount from user's main wallet
        const debitRequestBody = buildRoiDebitRequestBody(request_id, user_id, amount_to_withdraw, stakingTransactionID, stakingMetaData, stakingMetrics);
        const debitResponse = await createDebitTransaction(userBearerJWToken, debitRequestBody);

        // Step 2: Credit the user's main wallet
        const creditRequestBody = buildRoiCreditRequestBody(request_id, user_id, amount_to_withdraw, stakingTransactionID, stakingMetaData, stakingMetrics, debitResponse.data.data.transaction_id);
        const creditResponse = await createCreditTransaction(userBearerJWToken, creditRequestBody);

        // Step 3: Update staking meta with withdrawal information
        const currentTime = Math.floor(Date.now() / 1000);
        const updateMetaRequestBody = buildUpdateStakingRequestBody(stakingTransactionID, stakingMetaData, amount_to_withdraw, currentTime, stakingMetrics, false, creditResponse.data.data.transaction_id, request_id);
        await updateStakingMeta(stakingTransactionID, userBearerJWToken, updateMetaRequestBody);

        // Invalidate cache to ensure fresh data on next request
        invalidateStakingMetaCache(stakingTransactionID);

        // Success response
        const successResponse = buildRoiWithdrawalSuccessResponse(
            stakingTransactionID,
            stakingMetaData,
            amount_to_withdraw,
            currentTime,
            debitResponse.data.data.transaction_id,
            creditResponse.data.data.transaction_id,
            false, // isExternal
            null, // blockchain_withdrawal_address_to
            null // withdrawalRequestTransactionId
        );

        return res.status(200).send(successResponse);

    } catch (error) {
        return handleTryCatchError(res, error, `${MODULE1_STAKING_PLAN_5_NAME} ROI withdrawal`);
    }
});

/**
 * ${MODULE1_STAKING_PLAN_5_NAME} Staking ROI Withdrawal - External
 * Withdrawal to external blockchain wallet
 */
router.post('/blockchain-external/:stakingTransactionID', async (req, res) => {
    try {
        const stakingTransactionID = req.params.stakingTransactionID;
        const { request_id, user_id, amount_to_withdraw, blockchain_withdrawal_address_to } = req.body;

        // Validate JWT token
        const jwtValidation = validateJWTToken(req, res);
        if (jwtValidation.error) return jwtValidation.error;
        const { userBearerJWToken } = jwtValidation;

        // Validate blockchain withdrawal address
        const addressValidation = validateBlockchainWithdrawalAddress(blockchain_withdrawal_address_to);
        if (addressValidation.error) {
            return res.status(400).json(addressValidation.error);
        }

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

        // Fetch and validate staking meta data
        const stakingMetaData = await fetchAndValidateStakingMeta(stakingTransactionID, userBearerJWToken);

        // Validate Plan 5 staking
        const plan5Validation = validateStakingPlan(stakingMetaData, "plan_5");
        if (plan5Validation.error) return res.status(400).json(plan5Validation.error);

        // Calculate staking metrics using utils - use pattern-specific calculation
        let stakingMetrics;
        if (stakingMetaData.staking_roi_payment_pattern === "internal_pattern_2") {
            // For pattern_2, calculate using pattern-specific fields
            const staking_roi_payment_endtime_ts = parseInt(stakingMetaData.staking_roi_payment_endtime_ts_internal_pattern_2);
            
            // For Plan 5, if capital has been withdrawn, use the capital withdrawal time as the effective end time
            const stakingPlanId = stakingMetaData.staking_plan_id;
            const capitalWithdrawnAt = parseInt(stakingMetaData.staking_capital_withdrawn_at);
            let effectiveEndTime = staking_roi_payment_endtime_ts;
            
            if (stakingPlanId === 'plan_5' && capitalWithdrawnAt && capitalWithdrawnAt > 0) {
                // For Plan 5 with capital withdrawn, ROI stops at capital withdrawal time
                effectiveEndTime = Math.min(staking_roi_payment_endtime_ts, capitalWithdrawnAt);
            }
            
            stakingMetrics = calculateStakingROIMetricsFromMetaDataPattern2(stakingMetaData, effectiveEndTime);
        } else {
            // For normal pattern, use standard calculation
            stakingMetrics = calculateStakingROIMetricsFromMetaData(stakingMetaData);
        }

        // 1. Check if transaction with request id exists, tell the user it exists if it exists
        const withdrawalExists = await checkWithdrawalExists(stakingTransactionID, request_id);
        if (withdrawalExists) {
            return res.status(400).send({
                status: false,
                status_code: 400,
                message: `ROI withdrawal already processed for this request`,
                error: { request_id, existing_transaction: withdrawalExists }
            });
        }

        // 2. Check for ROI Eligible time
        const timingValidation = validateRoiWithdrawalTiming(stakingMetaData);
        if (timingValidation.error) {
            return res.status(400).send(timingValidation.error);
        }

        // 3. Check if user ROI balance is enough, if not throw error
        if (!stakingMetrics.accumulated_roi_user_can_withdraw_now || stakingMetrics.accumulated_roi_user_can_withdraw_now <= 0) {
            const insufficientBalanceError = buildInsufficientRoiBalanceError(stakingMetrics, stakingMetaData);
            return res.status(400).send(insufficientBalanceError);
        }

        // 4. Validate withdrawal amount
        const validationError = validateWithdrawalAmount(amount_to_withdraw, stakingMetrics);
        if (validationError) {
            return res.status(400).send(validationError);
        }

        // Get dynamic fee configuration for external ROI withdrawal
        const planData = await getStakingPlanDataFromAPI('plan_5');
        if (!planData.status) {
            return res.status(400).json(planData.error);
        }

        const fee_amount = planData.data.roi_withdrawal_fee_external;
        const fee_wallet = planData.data.roi_withdrawal_fee_wallet;
        
        // Skip fee processing if fee is zero
        if (parseFloat(fee_amount) > 0) {
            // Check if user has sufficient balance for fee
            const feeBalanceCheck = await checkUserFeeBalance(userBearerJWToken, fee_amount, fee_wallet, user_id);
            if (!feeBalanceCheck.status) {
                return res.status(400).json(feeBalanceCheck.error);
            }

            // Deduct the fee
            const feeDeduction = await deductUserFee(userBearerJWToken, fee_amount, fee_wallet, user_id, stakingTransactionID);
            if (!feeDeduction.status) {
                return res.status(400).json(feeDeduction.error);
            }

            // Credit the fee to fee user
            const feeCredit = await creditFeeToFeeUser(userBearerJWToken, fee_amount, fee_wallet, stakingTransactionID, user_id);
            if (!feeCredit.status) {
                return res.status(400).json(feeCredit.error);
            }
        }

        // Check for pending transactions
        const transactionExists = await checkPendingTransactions(user_id, userBearerJWToken);
        if (transactionExists === "yes") {
            const pendingError = buildPendingTransactionError(transactionExists);
            return res.status(400).send(pendingError);
        }

        // Step 1: Credit the ROI wallet
        const creditRequestBody = buildRoiCreditRequestBody(request_id, user_id, amount_to_withdraw, stakingTransactionID, stakingMetaData, stakingMetrics);
        const creditResponse = await createCreditTransaction(userBearerJWToken, creditRequestBody);

        // Step 2: Update staking meta with withdrawal information (after credit)
        const currentTime = Math.floor(Date.now() / 1000);
        const updateMetaRequestBody = buildUpdateStakingRequestBody(stakingTransactionID, stakingMetaData, amount_to_withdraw, currentTime, stakingMetrics, true, creditResponse.data.data.transaction_id, request_id);
        
        await updateStakingMeta(stakingTransactionID, userBearerJWToken, updateMetaRequestBody);

        // Step 3: Submit withdrawal request to external wallet (debit transaction)
        const withdrawalDebitRequestBody = buildExternalWithdrawalDebitRequestBody(
            request_id,
            stakingTransactionID,
            user_id,
            amount_to_withdraw,
            stakingMetaData.staking_roi_payment_wallet_id_internal_pattern_2,
            blockchain_withdrawal_address_to,
            stakingMetaData,
            null, // debitTransactionId not needed for external withdrawal
            creditResponse.data.data.transaction_id,
            stakingMetaData.staking_plan_id
        );

        const withdrawalDebitResponse = await createDebitTransaction(userBearerJWToken, withdrawalDebitRequestBody);

        // Step 4: Update user's pending transaction existence status
        await updateUserPendingTransactionStatus(user_id, userBearerJWToken, "yes");

        // Invalidate cache to ensure fresh data on next request
        invalidateStakingMetaCache(stakingTransactionID);

        // Success response
        const successResponse = buildRoiWithdrawalSuccessResponse(
            stakingTransactionID,
            stakingMetaData,
            amount_to_withdraw,
            currentTime,
            null, // debitTransactionId not applicable for external withdrawal
            creditResponse.data.data.transaction_id,
            true, // isExternal
            blockchain_withdrawal_address_to,
            withdrawalDebitResponse.data.data.transaction_id
        );

        return res.status(200).send(successResponse);

    } catch (error) {
        return handleTryCatchError(res, error, `${MODULE1_STAKING_PLAN_5_NAME} ROI external withdrawal`);
    }
});

module.exports = router;

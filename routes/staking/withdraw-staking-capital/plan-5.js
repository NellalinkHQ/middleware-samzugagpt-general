const express = require('express');
const { Web3 } = require('web3');
const router = express.Router();

const { handleTryCatchError } = require('../../../middleware-utils/custom-try-catch-error');

// Import shared utilities
const {
    validateJWTToken,
    validateBlockchainWithdrawalAddress,
    fetchAndValidateStakingMeta,
    validatePlanStaking,
    checkCapitalAlreadyWithdrawn,
    validateCapitalWithdrawalTiming,
    extractStakingFields,
    buildCapitalDebitRequestBody,
    buildCapitalCreditRequestBody,
    buildCapitalUpdateMetaRequestBody,
    checkExternalWithdrawalExists,
    checkPendingTransactions,
    updateUserPendingTransactionStatus,
    updateStakingMeta,
    createDebitTransaction,
    createCreditTransaction,
    buildExternalWithdrawalDebitRequestBody,
    buildCapitalWithdrawalSuccessResponse,
    checkInternalWithdrawalBlocked,
    buildInternalWithdrawalBlockedError,
    buildExternalWithdrawalExistsError,
    buildPendingTransactionError,
    buildTimingValidationError,
    invalidateStakingMetaCache,
    checkUserFeeBalance,
    deductUserFee,
    creditFeeToFeeUser
} = require('./utils');

const MODULE1_STAKING_PLAN_5_NAME = process.env.MODULE1_STAKING_PLAN_5_NAME || 'Plan 5';
const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

// Import get-staking utils for dynamic fee configuration
const { getStakingPlanDataFromAPI } = require('../get-staking/utils');

// Initialize Web3 for EVM address validation
let web3;
try {
    const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET;
    const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET;
    const MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK?.toLowerCase();
    
    if (MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK === "testnet") {
        web3 = new Web3(MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET);
    } else {
        web3 = new Web3(MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET);
    }
} catch (error) {
    console.error('Web3 initialization error:', error);
}

/**
 * ${MODULE1_STAKING_PLAN_5_NAME} Staking Capital Withdrawal
 * Internal withdrawal to user's main wallet
 */
router.post('/:stakingTransactionID', async (req, res) => {
    try {
        const stakingTransactionID = req.params.stakingTransactionID;
        const { request_id } = req.body;

        // Validate JWT token
        const jwtValidation = validateJWTToken(req, res);
        if (jwtValidation.error) return jwtValidation.error;
        const { userBearerJWToken } = jwtValidation;

        // Fetch and validate staking meta data
        const stakingMeta = await fetchAndValidateStakingMeta(stakingTransactionID, userBearerJWToken);

        // Validate Plan 5 staking
        const plan5Validation = validatePlanStaking(stakingMeta, 'plan_5');
        if (plan5Validation.error) return res.status(400).json(plan5Validation.error);

        // Check if capital has already been withdrawn
        const capitalWithdrawnCheck = checkCapitalAlreadyWithdrawn(stakingMeta, stakingTransactionID);
        if (capitalWithdrawnCheck.error) return res.status(400).send(capitalWithdrawnCheck.error);

        // Check capital withdrawal timing
        const timingValidation = validateCapitalWithdrawalTiming(stakingMeta, stakingTransactionID);
        if (timingValidation.error) return res.status(400).send(timingValidation.error);

        // Extract required fields
        const { staking_capital_payment_wallet_id, staking_amount, user_id, staking_locked_wallet_id } = extractStakingFields(stakingMeta);

        // Get dynamic fee configuration for internal withdrawal
        const planData = await getStakingPlanDataFromAPI('plan_5');
        
        if (!planData.status) {
            return res.status(400).json(planData.error);
        }

        const fee_amount = planData.data.capital_withdrawal_fee_internal;
        const fee_wallet = planData.data.capital_withdrawal_fee_wallet;
        
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

        // Step 1: Debit the locked staking wallet
        const debitRequestBody = buildCapitalDebitRequestBody(request_id, user_id, stakingTransactionID, staking_amount, staking_locked_wallet_id, stakingMeta, false);
        const debitResponse = await createDebitTransaction(userBearerJWToken, debitRequestBody);

        // Step 2: Credit the main wallet
        const creditRequestBody = buildCapitalCreditRequestBody(request_id, user_id, stakingTransactionID, staking_amount, staking_capital_payment_wallet_id, stakingMeta, debitResponse.data.data.transaction_id, false);
        const creditResponse = await createCreditTransaction(userBearerJWToken, creditRequestBody);

        // Step 3: Update staking meta with withdrawal information
        const currentTime = Math.floor(Date.now() / 1000);
        const updateMetaRequestBody = buildCapitalUpdateMetaRequestBody(
            debitResponse.data.data.transaction_id,
            creditResponse.data.data.transaction_id,
            currentTime,
            stakingTransactionID,
            stakingMeta,
            false
        );
        await updateStakingMeta(stakingTransactionID, userBearerJWToken, updateMetaRequestBody);

        // Invalidate cache to ensure fresh data on next request
        invalidateStakingMetaCache(stakingTransactionID);

        // Success response
        const successResponse = buildCapitalWithdrawalSuccessResponse(
            stakingTransactionID,
            stakingMeta,
            staking_amount,
            currentTime,
            debitResponse.data.data.transaction_id,
            creditResponse.data.data.transaction_id,
            false, // isExternal
            null, // blockchain_withdrawal_address_to
            null // withdrawalRequestTransactionId
        );

        return res.status(200).send(successResponse);

    } catch (error) {
        return handleTryCatchError(res, error, `${MODULE1_STAKING_PLAN_5_NAME} capital withdrawal`);
    }
});

/**
 * ${MODULE1_STAKING_PLAN_5_NAME} Staking Capital Withdrawal - External
 * Withdrawal to external blockchain wallet
 */
router.post('/blockchain-external/:stakingTransactionID', async (req, res) => {
    try {
        const stakingTransactionID = req.params.stakingTransactionID;
        const { request_id, blockchain_withdrawal_address_to } = req.body;

        // Validate JWT token
        const jwtValidation = validateJWTToken(req, res);
        if (jwtValidation.error) return jwtValidation.error;
        const { userBearerJWToken } = jwtValidation;

        // Validate blockchain withdrawal address
        const addressValidation = validateBlockchainWithdrawalAddress(blockchain_withdrawal_address_to);
        if (addressValidation.error) {
            return res.status(400).json(addressValidation.error);
        }


        // Fetch and validate staking meta data
        const stakingMeta = await fetchAndValidateStakingMeta(stakingTransactionID, userBearerJWToken);

        // Validate Plan 5 staking
        const planValidation = validatePlanStaking(stakingMeta, 'plan_5');
        if (planValidation.error) return res.status(400).json(planValidation.error);

        // Check if capital has already been withdrawn
        const capitalWithdrawnCheck = checkCapitalAlreadyWithdrawn(stakingMeta, stakingTransactionID);
        if (capitalWithdrawnCheck.error) return res.status(400).send(capitalWithdrawnCheck.error);

        // Check capital withdrawal timing
        const timingValidation = validateCapitalWithdrawalTiming(stakingMeta, stakingTransactionID);
        if (timingValidation.error) return res.status(400).send(timingValidation.error);

        // Extract required fields first
        const { staking_capital_payment_wallet_id, staking_amount, user_id, staking_locked_wallet_id } = extractStakingFields(stakingMeta);

        // Get dynamic fee configuration for external withdrawal
        const planData = await getStakingPlanDataFromAPI('plan_5');
        if (!planData.status) {
            return res.status(400).json(planData.error);
        }

        const fee_amount = planData.data.capital_withdrawal_fee_external;
        const fee_wallet = planData.data.capital_withdrawal_fee_wallet;
        
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

        // Check if external withdrawal has already been processed
        const externalWithdrawalExists = await checkExternalWithdrawalExists(stakingTransactionID, user_id);
        if (externalWithdrawalExists) {
            const externalError = buildExternalWithdrawalExistsError(stakingTransactionID, stakingMeta, externalWithdrawalExists);
            return res.status(400).send(externalError);
        }

        // Check if internal withdrawal has already occurred (block external)
        const internalWithdrawnCheck = checkInternalWithdrawalBlocked(stakingMeta, stakingTransactionID);
        if (internalWithdrawnCheck.error) return res.status(400).send(internalWithdrawnCheck.error);

        // Check for pending transactions
        const transactionExists = await checkPendingTransactions(user_id, userBearerJWToken);
        if (transactionExists === "yes") {
            const pendingError = buildPendingTransactionError(transactionExists);
            return res.status(400).send(pendingError);
        }

        // Step 1: Debit the locked staking wallet
        const debitRequestBody = buildCapitalDebitRequestBody(request_id, user_id, stakingTransactionID, staking_amount, staking_locked_wallet_id, stakingMeta, true);
        // Add blockchain withdrawal address to meta_data for external withdrawals
        debitRequestBody.meta_data.blockchain_withdrawal_address_to = blockchain_withdrawal_address_to;
        const debitResponse = await createDebitTransaction(userBearerJWToken, debitRequestBody);

        // Step 2: Credit the main wallet
        const creditRequestBody = buildCapitalCreditRequestBody(request_id, user_id, stakingTransactionID, staking_amount, staking_capital_payment_wallet_id, stakingMeta, debitResponse.data.data.transaction_id, true);
        // Add blockchain withdrawal address to meta_data for external withdrawals
        creditRequestBody.meta_data.blockchain_withdrawal_address_to = blockchain_withdrawal_address_to;
        const creditResponse = await createCreditTransaction(userBearerJWToken, creditRequestBody);

        // Step 3: Submit withdrawal request to external wallet (debit transaction)
        const withdrawalDebitRequestBody = buildExternalWithdrawalDebitRequestBody(
            stakingTransactionID,
            user_id,
            staking_amount,
            staking_capital_payment_wallet_id,
            blockchain_withdrawal_address_to,
            stakingMeta,
            debitResponse.data.data.transaction_id,
            creditResponse.data.data.transaction_id,
            'plan_5'
        );

        const withdrawalDebitResponse = await createDebitTransaction(userBearerJWToken, withdrawalDebitRequestBody);

        // Step 4: Update staking meta with withdrawal information
        const currentTime = Math.floor(Date.now() / 1000);
        
        // For Plan 5, update ROI end time to current time when capital is withdrawn
        const updateMetaRequestBody = buildCapitalUpdateMetaRequestBody(
            debitResponse.data.data.transaction_id,
            creditResponse.data.data.transaction_id,
            currentTime,
            stakingTransactionID,
            stakingMeta,
            true,
            blockchain_withdrawal_address_to,
            withdrawalDebitResponse.data.data.transaction_id
        );
        await updateStakingMeta(stakingTransactionID, userBearerJWToken, updateMetaRequestBody);

        // Step 5: Update user's pending transaction existence status
        await updateUserPendingTransactionStatus(user_id, userBearerJWToken, "yes");

        // Invalidate cache to ensure fresh data on next request
        invalidateStakingMetaCache(stakingTransactionID);

        // Success response
        const successResponse = buildCapitalWithdrawalSuccessResponse(
            stakingTransactionID,
            stakingMeta,
            staking_amount,
            currentTime,
            debitResponse.data.data.transaction_id,
            creditResponse.data.data.transaction_id,
            true, // isExternal
            blockchain_withdrawal_address_to,
            withdrawalDebitResponse.data.data.transaction_id
        );

        return res.status(200).send(successResponse);

    } catch (error) {
        return handleTryCatchError(res, error, `${MODULE1_STAKING_PLAN_5_NAME} capital external withdrawal`);
    }
});

module.exports = router;

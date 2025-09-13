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

const MODULE1_STAKING_PLAN_4_NAME = process.env.MODULE1_STAKING_PLAN_4_NAME || 'Plan 4';
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
    console.error("Error initializing Web3 for EVM validation:", error.message);
}

// POST /staking/withdraw-staking-capital/plan-4/:stakingTransactionID
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

        // Validate Plan 4 staking
        const plan4Validation = validatePlanStaking(stakingMeta, 'plan_4');
        if (plan4Validation.error) return res.status(400).json(plan4Validation.error);

        // Check if capital has already been withdrawn
        const alreadyWithdrawnCheck = checkCapitalAlreadyWithdrawn(stakingMeta, stakingTransactionID);
        if (alreadyWithdrawnCheck.error) return res.status(400).json(alreadyWithdrawnCheck.error);

        // Validate capital withdrawal timing
        const timingValidation = validateCapitalWithdrawalTiming(stakingMeta, stakingTransactionID);
        if (timingValidation.error) return res.status(400).json(timingValidation.error);

        // Extract required fields
        const { staking_capital_payment_wallet_id, staking_amount, user_id, staking_locked_wallet_id } = extractStakingFields(stakingMeta);

        // Get dynamic fee configuration for internal withdrawal
        const planData = await getStakingPlanDataFromAPI('plan_4');
        if (!planData.status) {
            return res.status(400).json(planData.error);
        }

        const fee_amount = planData.data.capital_withdrawal_fee_internal;
        const fee_wallet = planData.data.capital_withdrawal_fee_wallet;
        let fee_transaction_id = null;
        
        // Skip fee processing if fee is zero
        if (parseFloat(fee_amount) > 0) {
            // Check if user has sufficient balance for fee
            const feeBalanceCheck = await checkUserFeeBalance(userBearerJWToken, fee_amount, fee_wallet, user_id);
            if (!feeBalanceCheck.status) {
                return res.status(400).json(feeBalanceCheck.error);
            }

            // Deduct the fee
            const feeDeduction = await deductUserFee(userBearerJWToken, fee_amount, fee_wallet, user_id, stakingTransactionID, request_id);
            if (!feeDeduction.status) {
                return res.status(400).json(feeDeduction.error);
            }

            // Capture fee transaction ID
            fee_transaction_id = feeDeduction.data.transaction_id;

            // Credit the fee to fee user 
            const feeCredit = await creditFeeToFeeUser(userBearerJWToken, fee_amount, fee_wallet, stakingTransactionID, user_id, request_id);
            if (!feeCredit.status) {
                return res.status(400).json(feeCredit.error);
            }
        }

        // Step 1: Debit the locked staking wallet
        const debitRequestBody = buildCapitalDebitRequestBody(request_id, user_id, stakingTransactionID, staking_amount, staking_locked_wallet_id, stakingMeta, false, fee_transaction_id, fee_amount, fee_wallet);
        const debitResponse = await createDebitTransaction(userBearerJWToken, debitRequestBody);

        // Step 2: Credit the main wallet
        const creditRequestBody = buildCapitalCreditRequestBody(request_id, user_id, stakingTransactionID, staking_amount, staking_capital_payment_wallet_id, stakingMeta, debitResponse.data.data.transaction_id, false, fee_transaction_id, fee_amount, fee_wallet);
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
            false
        );
        return res.status(200).json(successResponse);

    } catch (error) {
        console.error(`${MODULE1_STAKING_PLAN_4_NAME} Capital Withdrawal Error:`, error);
        
        // Handle specific error cases
        if (error.response) {
            return res.status(error.response.status).json({
                status: false,
                status_code: error.response.status,
                message: `${MODULE1_STAKING_PLAN_4_NAME} Capital Withdrawal Failed`,
                error: {
                    api_error: error.response.data,
                    staking_transaction_id: req.params.stakingTransactionID
                }
            });
        }

        return res.status(400).json({
            status: false,
            status_code: 400,
            message: `Internal server error during ${MODULE1_STAKING_PLAN_4_NAME} capital withdrawal`,
            error: {
                message: error.message,
                staking_transaction_id: req.params.stakingTransactionID
            }
        });
    }
});

// POST /staking/withdraw-staking-capital/plan-4/block-chain-external/:stakingTransactionID
router.post('/blockchain-external/:stakingTransactionID', async (req, res) => {
    try {
        const stakingTransactionID = req.params.stakingTransactionID;
        const { request_id, amount_to_withdraw, blockchain_withdrawal_address_to } = req.body;

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

        // Validate Plan 4 staking
        const planValidation = validatePlanStaking(stakingMeta, 'plan_4');
        if (planValidation.error) return res.status(400).json(planValidation.error);

        // Extract required fields
        const { staking_capital_payment_wallet_id, staking_amount, user_id, staking_locked_wallet_id } = extractStakingFields(stakingMeta);

        // Check if capital has already been withdrawn (internal withdrawal)
        const internalWithdrawnCheck = checkInternalWithdrawalBlocked(stakingMeta, stakingTransactionID);
        if (internalWithdrawnCheck.error) {
            return res.status(400).json(internalWithdrawnCheck.error);
        }

        // Validate capital withdrawal timing (check if capital is still locked)
        const externalTimingValidation = validateCapitalWithdrawalTiming(stakingMeta, stakingTransactionID);
        if (externalTimingValidation.error) {
            const timingError = buildTimingValidationError(stakingTransactionID, stakingMeta, externalTimingValidation.error.details);
            return res.status(400).json(timingError);
        }

        // Check if external withdrawal has already been processed
        const externalWithdrawalExists = await checkExternalWithdrawalExists(stakingTransactionID, user_id);
        if (externalWithdrawalExists) {
            const externalError = buildExternalWithdrawalExistsError(stakingTransactionID, stakingMeta, externalWithdrawalExists);
            return res.status(400).json(externalError);
        }

        // Perform transaction existence check
        const transactionExists = await checkPendingTransactions(user_id, userBearerJWToken);

        if (transactionExists === "yes") {
            const pendingError = buildPendingTransactionError(transactionExists);
            return res.status(400).json(pendingError);
        }

        // Check if capital has already been withdrawn
        const alreadyWithdrawnCheck = checkCapitalAlreadyWithdrawn(stakingMeta, stakingTransactionID);
        if (alreadyWithdrawnCheck.error) return res.status(400).json(alreadyWithdrawnCheck.error);

        // Validate capital withdrawal timing
        const timingValidation = validateCapitalWithdrawalTiming(stakingMeta, stakingTransactionID);
        if (timingValidation.error) return res.status(400).json(timingValidation.error);

        // Get dynamic fee configuration for external withdrawal
        const planData = await getStakingPlanDataFromAPI('plan_4');
        if (!planData.status) {
            return res.status(400).json(planData.error);
        }

        const fee_amount = planData.data.capital_withdrawal_fee_external;
        const fee_wallet = planData.data.capital_withdrawal_fee_wallet;
        let fee_transaction_id = null;
        
        // Skip fee processing if fee is zero
        if (parseFloat(fee_amount) > 0) {
            // Check if user has sufficient balance for fee
            const feeBalanceCheck = await checkUserFeeBalance(userBearerJWToken, fee_amount, fee_wallet, user_id);
            if (!feeBalanceCheck.status) {
                return res.status(400).json(feeBalanceCheck.error);
            }

            // Deduct the fee
            const feeDeduction = await deductUserFee(userBearerJWToken, fee_amount, fee_wallet, user_id, stakingTransactionID, request_id);
            if (!feeDeduction.status) {
                return res.status(400).json(feeDeduction.error);
            }

            // Capture fee transaction ID
            fee_transaction_id = feeDeduction.data.transaction_id;

            // Credit the fee to fee user
            const feeCredit = await creditFeeToFeeUser(userBearerJWToken, fee_amount, fee_wallet, stakingTransactionID, user_id, request_id);
            if (!feeCredit.status) {
                return res.status(400).json(feeCredit.error);
            }
        }

        // Step 1: Debit the locked staking wallet
        const debitRequestBody = buildCapitalDebitRequestBody(request_id, user_id, stakingTransactionID, staking_amount, staking_locked_wallet_id, stakingMeta, true, fee_transaction_id, fee_amount, fee_wallet);
        // Add blockchain withdrawal address to meta_data for external withdrawals
        debitRequestBody.meta_data.blockchain_withdrawal_address_to = blockchain_withdrawal_address_to;
        const debitResponse = await createDebitTransaction(userBearerJWToken, debitRequestBody);

        // Step 2: Credit the main wallet
        const creditRequestBody = buildCapitalCreditRequestBody(request_id, user_id, stakingTransactionID, staking_amount, staking_capital_payment_wallet_id, stakingMeta, debitResponse.data.data.transaction_id, true, fee_transaction_id, fee_amount, fee_wallet);
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
            'plan_4',
            fee_transaction_id,
            fee_amount,
            fee_wallet
        );

        const withdrawalDebitResponse = await createDebitTransaction(userBearerJWToken, withdrawalDebitRequestBody);

        // Step 4: Update staking meta with withdrawal information
        const currentTime = Math.floor(Date.now() / 1000);
        
        // For Plan 4, update ROI end time to current time when capital is withdrawn
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
            true,
            blockchain_withdrawal_address_to,
            withdrawalDebitResponse.data.data.transaction_id
        );
        return res.status(200).json(successResponse);

    } catch (error) {
        console.error(`${MODULE1_STAKING_PLAN_4_NAME} Capital External Withdrawal Error:`, error);
        
        // Handle specific error cases
        if (error.response) {
            return res.status(error.response.status).json({
                status: false,
                status_code: error.response.status,
                message: 'Capital External Withdrawal Failed - ' + error.response.data.message,
                error: {
                    api_error: error.response.data,
                    staking_transaction_id: req.params.stakingTransactionID
                }
            });
        }

        return res.status(400).json({
            status: false,
            status_code: 400,
            message: `Internal server error during ${MODULE1_STAKING_PLAN_4_NAME} capital external withdrawal - ` + error.message,
            error: {
                message: error.message,
                staking_transaction_id: req.params.stakingTransactionID
            }
        });
    }
});


module.exports = router;

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Import userWalletBalanceCheck Utils
const userWalletBalanceCheckUtils = require('../../middleware-utils/user-wallet-balance-check');
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');

// Set ENV Var
const MODULE1_BASE_URL = process.env.MODULE1_BASE_URL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_BASE_ALLOWED_WITHDRAWAL_WALLET_ID = process.env.MODULE1_BASE_ALLOWED_WITHDRAWAL_WALLET_ID;

router.post('/', async (req, res) => {
    try {
        const { request_id, user_id, withdrawal_amount, wallet_id, meta_data } = req.body;

        // Check if Authorization header is included
        if (!req.headers.authorization) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'JWT Token required',
                error: { error_data: req.headers.authorization }
            });
        }

        // Extract JWT Bearer token from the request headers
        const userBearerJWToken = req.headers.authorization.split(' ')[1];

        // Validate wallet_id against allowed IDs
        if (MODULE1_BASE_ALLOWED_WITHDRAWAL_WALLET_ID && MODULE1_BASE_ALLOWED_WITHDRAWAL_WALLET_ID.trim() !== '') {
            const ALLOWED_WALLET_IDS = MODULE1_BASE_ALLOWED_WITHDRAWAL_WALLET_ID.split(',');
            if (!ALLOWED_WALLET_IDS.includes(wallet_id)) {
                return res.status(400).json({
                    status: false,
                    status_code: 400,
                    message: "Invalid wallet_id",
                    error: { error_data: wallet_id }
                });
            }
        }

        if (withdrawal_amount <= 0) {
            // Return error response if pending transaction exists
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Minimum Withdrawal Amount less than 0",
                error: {
                    message: `Minimum Withdrawal Amount less than 0`,
                    recommendation: "Withdrawa not less than 0",
                    error_data: withdrawal_amount
                }
            });
        }

        if (withdrawal_amount < 10) {
            // Return error response if pending transaction exists
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Minimum Withdrawal Amount is 10",
                error: {
                    message: `Minimum Withdrawal Amount is 10`,
                    recommendation: "Withdrawa not less than minimum amount",
                    error_data: withdrawal_amount
                }
            });
        }

        if (withdrawal_amount > 20) {
            // Return error response if pending transaction exists
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Maximum Withdrawal Amount is 20",
                error: {
                    message: `Maximum Withdrawal Amount is 20`,
                    recommendation: "Withdraw not greater than maximum amount",
                    error_data: withdrawal_amount
                }
            });
        }

        // Perform transaction existence check
        let transactionExists = "no"; // Default to "no" if check fails
        const transactionExistsCheckUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/user/${user_id}/utils/check-if-meta-value-exists?meta_key=pending_withdrawal_transaction_exists&meta_value=yes`;
        
        try {
            const transactionExistsResponse = await axios.get(transactionExistsCheckUrl, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}`
                }
            });
            
            transactionExists = transactionExistsResponse.data.data.pending_withdrawal_transaction_exists;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                // Handle 404 (Not Found) response if transaction check endpoint is not available
                transactionExists = "no";
            } else {
                throw error; // Propagate other errors
            }
        }

        if (transactionExists === "yes") {
            // Return error response if pending transaction exists
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "A pending transaction request already exists",
                error: {
                    message: `Transaction exists with state: ${transactionExists}`,
                    recommendation: "Wait for transaction state to change",
                    error_data: transactionExists
                }
            });
        }

        // Proceed with the withdrawal process
        // Step 1: Check user's wallet balance
        // const balanceCheckMiddleware = userWalletBalanceCheck(MODULE1_BASE_URL, MODULE1_BASE_API_KEY, userBearerJWToken, user_id, wallet_id, withdrawal_amount);
        // await balanceCheckMiddleware(req, res);

        const balanceCheckResult = await userWalletBalanceCheckUtils(MODULE1_BASE_URL, MODULE1_BASE_API_KEY, userBearerJWToken, user_id, wallet_id, withdrawal_amount);

        if (balanceCheckResult.status!=true) {
            return res.status(400).send(balanceCheckResult);// Return if balance Result is not sufficient
        }

        // Step 2: Merge frontend meta_data with backend default meta_data
        const backendMetaData = {
            transaction_action_type: "withdrawal_request",
            transaction_type_category: "blockchain_withdrawal",
            transaction_external_processor: "administrator",
            transaction_approval_status: "pending",
            transaction_approval_method_status: "admin_pending",
            transaction_approval_method: "admin",
            transaction_requested_time: Date.now(),
            transaction_requested_by: user_id
        };

        const mergedMetaData = { ...meta_data, ...backendMetaData };

        // Step 3: Initiate debit transaction
        const debitUrl = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/debits`;
        const debitRequestBody = {
            request_id: `withdrawal_request_${request_id}`,
            user_id,
            amount: withdrawal_amount,
            wallet_id,
            note: `Withdrawal Request`,
            meta_data: mergedMetaData
        };

        const debitResponse = await axios.post(debitUrl, debitRequestBody, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Step 4: Update user's pending transaction existence status
        const updateUserPendingTransactionExistsUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/user/${user_id}`;
        const updateUserPendingTransactionExistsRequestBody = {
            pending_withdrawal_transaction_exists: "yes"
        };

        const updateUserPendingTransactionExistsResponse = await axios.put(updateUserPendingTransactionExistsUrl, updateUserPendingTransactionExistsRequestBody, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Success response
        return res.status(200).json({
            status: true,
            status_code: 200,
            message: "Withdrawal Submitted Successfully",
            data: {
                debitResponse: debitResponse.data,
                updateUserPendingTransactionExistsResponse: updateUserPendingTransactionExistsResponse.data
            }
        });
    } catch (error) {
        // Handle errors using custom error handling middleware
        handleTryCatchError(res, error);
    }
});

module.exports = router;

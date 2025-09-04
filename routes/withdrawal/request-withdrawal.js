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

// Cache for withdrawal limits (1 hour TTL)
const withdrawalLimitsCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

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

        // Fetch dynamic withdrawal limits
        const withdrawalLimits = await fetchWithdrawalLimits(wallet_id, userBearerJWToken);
        const { minimum_withdrawal_amount, maximum_withdrawal_amount, withdrawal_fee } = withdrawalLimits;

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

        if (withdrawal_amount < minimum_withdrawal_amount || (minimum_withdrawal_amount === 0 && withdrawal_amount <= 0)) {
            // Return error response if pending transaction exists
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: minimum_withdrawal_amount === 0 ? "Withdrawal amount must be greater than 0" : `Minimum Withdrawal Amount is ${minimum_withdrawal_amount}`,
                error: {
                    message: minimum_withdrawal_amount === 0 ? "Withdrawal amount must be greater than 0" : `Minimum Withdrawal Amount is ${minimum_withdrawal_amount}`,
                    recommendation: "Withdrawa not less than minimum amount",
                    error_data: withdrawal_amount,
                    wallet_id: wallet_id,
                    limits: {
                        minimum: minimum_withdrawal_amount === 0 ? "No minimum" : minimum_withdrawal_amount,
                        maximum: maximum_withdrawal_amount === Infinity ? "No limit" : maximum_withdrawal_amount,
                        fee: withdrawal_fee
                    }
                }
            });
        }

        if (withdrawal_amount > maximum_withdrawal_amount) {
            // Return error response if pending transaction exists
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: maximum_withdrawal_amount === Infinity ? "Maximum withdrawal limit exceeded" : `Maximum Withdrawal Amount is ${maximum_withdrawal_amount}`,
                error: {
                    message: maximum_withdrawal_amount === Infinity ? "Maximum withdrawal limit exceeded" : `Maximum Withdrawal Amount is ${maximum_withdrawal_amount}`,
                    recommendation: "Withdraw not greater than maximum amount",
                    error_data: withdrawal_amount,
                    wallet_id: wallet_id,
                    limits: {
                        minimum: minimum_withdrawal_amount,
                        maximum: maximum_withdrawal_amount === Infinity ? "No limit" : maximum_withdrawal_amount,
                        fee: withdrawal_fee
                    }
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
        // Step 1: Check user's wallet balance (including withdrawal fee)
        const totalAmountRequired = withdrawal_amount + withdrawal_fee;
        const balanceCheckResult = await userWalletBalanceCheckUtils(MODULE1_BASE_URL, MODULE1_BASE_API_KEY, userBearerJWToken, user_id, wallet_id, totalAmountRequired);

        if (balanceCheckResult.status!=true) {
            return res.status(400).send(balanceCheckResult);// Return if balance Result is not sufficient
        }

        // Step 2: Merge frontend meta_data with backend default meta_data
        const backendMetaData = {
            transaction_action_type: "withdrawal_request",
            transaction_type_category: "withdrawals",
            transaction_processor: "middleware",
            transaction_external_processor: "administrator",
            transaction_status: "pending",
            transaction_approval_status: "admin_pending",
            transaction_approval_method: "admin",
            transaction_requested_time: Date.now(),
            transaction_requested_by: user_id,
            withdrawal_fee: withdrawal_fee,
            total_amount_withdrawn: totalAmountRequired
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
                updateUserPendingTransactionExistsResponse: updateUserPendingTransactionExistsResponse.data,
                withdrawal_details: {
                    withdrawal_amount: withdrawal_amount,
                    withdrawal_fee: withdrawal_fee,
                    total_amount_debited: totalAmountRequired,
                    wallet_id: wallet_id,
                    limits: {
                        minimum: minimum_withdrawal_amount === 0 ? "No minimum" : minimum_withdrawal_amount,
                        maximum: maximum_withdrawal_amount === Infinity ? "No limit" : maximum_withdrawal_amount,
                        fee: withdrawal_fee
                    }
                }
            }
        });
    } catch (error) {
        // Handle errors using custom error handling middleware
        handleTryCatchError(res, error);
    }
});



/**
 * Fetch withdrawal limits dynamically based on wallet_id with 1-hour caching
 * @param {string} wallet_id - The wallet ID to get limits for
 * @param {string} userBearerJWToken - JWT token for authentication
 * @returns {Object} Object containing min, max, and fee amounts
 */
async function fetchWithdrawalLimits(wallet_id, userBearerJWToken) {
    const cacheKey = `withdrawal_limits_${wallet_id}`;
    const now = Date.now();
    
    // Check cache first
    const cached = withdrawalLimitsCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
        console.log(`Using cached withdrawal limits for ${wallet_id}`);
        return cached.data;
    }

    try {
        const metaKeys = `minimum_withdrawal_amount_${wallet_id},maximum_withdrawal_amount_${wallet_id},withdrawal_fee_${wallet_id}`;
        const url = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/site-wide?meta_key=${metaKeys}`;
        
        const response = await axios.get(url, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            },
            timeout: 10000 // 10 second timeout
        });

        const data = response.data.data || {};
        
        // Handle the API response format properly
        // Values can be false (not set), string numbers, or actual numbers
        const getValueOrDefault = (value, type) => {
            if (value === false || value === null || value === undefined || value === '') {
                if (type === 'fee') return 0;
                if (type === 'minimum') return 0; // No minimum limit
                if (type === 'maximum') return Infinity; // No maximum limit
                return 0;
            }
            
            const parsed = parseFloat(value);
            if (isNaN(parsed)) {
                if (type === 'fee') return 0;
                if (type === 'minimum') return 0; // No minimum limit
                if (type === 'maximum') return Infinity; // No maximum limit
                return 0;
            }
            
            // Handle specific type logic
            if (type === 'fee') {
                return parsed <= 0 ? 0 : parsed; // Negative, 0, or false = 0
            }
            if (type === 'minimum') {
                return parsed <= 0 ? 0 : parsed; // 0 or negative = no minimum
            }
            if (type === 'maximum') {
                return parsed <= 0 ? Infinity : parsed; // 0 or negative = no maximum
            }
            
            return parsed;
        };
        
        // Extract values with proper handling of false/string values
        const minimum_withdrawal_amount = getValueOrDefault(data[`minimum_withdrawal_amount_${wallet_id}`], 'minimum');
        const maximum_withdrawal_amount = getValueOrDefault(data[`maximum_withdrawal_amount_${wallet_id}`], 'maximum');
        const withdrawal_fee = getValueOrDefault(data[`withdrawal_fee_${wallet_id}`], 'fee');

        const result = {
            minimum_withdrawal_amount,
            maximum_withdrawal_amount,
            withdrawal_fee,
            success: true,
            cached_at: new Date().toISOString()
        };

        // Cache the result
        withdrawalLimitsCache.set(cacheKey, {
            data: result,
            timestamp: now
        });

        console.log(`Fetched and cached withdrawal limits for ${wallet_id}:`, result);
        return result;
    } catch (error) {
        console.error('Error fetching withdrawal limits:', error);
        
        // Return default values if API call fails
        const fallbackResult = {
            minimum_withdrawal_amount: 0, // No minimum limit
            maximum_withdrawal_amount: Infinity, // No maximum limit
            withdrawal_fee: 0, // No fee
            success: false,
            error: error.message,
            cached_at: new Date().toISOString()
        };

        // Cache the fallback result as well to prevent repeated failed API calls
        withdrawalLimitsCache.set(cacheKey, {
            data: fallbackResult,
            timestamp: now
        });

        return fallbackResult;
    }
}


module.exports = router;

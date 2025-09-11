const axios = require('axios');
const { Web3 } = require('web3');

// Environment variables
const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

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

// Simple in-memory cache for staking meta data
const stakingMetaCache = new Map();
const CACHE_TTL = 30000; // 30 seconds cache

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
    return { token: req.headers.authorization.split(' ')[1] };
}

/**
 * Validate blockchain withdrawal address
 */
function validateBlockchainWithdrawalAddress(blockchain_withdrawal_address_to) {
    if (!blockchain_withdrawal_address_to) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: 'Blockchain withdrawal address is required',
                error: {
                    message: 'blockchain_withdrawal_address_to is required for external withdrawals',
                    recommendation: 'Provide a valid EVM address',
                    error_data: blockchain_withdrawal_address_to
                }
            }
        };
    }

    // Validate EVM address format
    if (!web3 || !web3.utils.isAddress(blockchain_withdrawal_address_to)) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: `Invalid Withdrawal address format - ${blockchain_withdrawal_address_to}`,
                error: {
                    message: `The withdrawal address "${blockchain_withdrawal_address_to}" is not a valid EVM address`,
                    recommendation: 'Provide a valid EVM address (0x followed by 40 hexadecimal characters)',
                    error_data: {
                        provided_address: blockchain_withdrawal_address_to,
                        address_length: blockchain_withdrawal_address_to ? blockchain_withdrawal_address_to.length : 0
                    }
                }
            }
        };
    }

    return { valid: true };
}

/**
 * Fetch and validate staking meta data
 */
async function fetchAndValidateStakingMeta(stakingTransactionID, userBearerJWToken) {
    // Check cache first
    const cached = stakingMetaCache.get(stakingTransactionID);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    // Fetch from API
    const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
    const response = await axios.get(stakingMetaUrl, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });
    
    const data = response.data.data;
    
    // Cache the result
    stakingMetaCache.set(stakingTransactionID, {
        data: data,
        timestamp: Date.now()
    });
    
    return data;
}

/**
 * Invalidate staking meta cache for a specific transaction
 */
function invalidateStakingMetaCache(stakingTransactionID) {
    stakingMetaCache.delete(stakingTransactionID);
}

/**
 * Validate Plan staking
 */
function validateStakingPlan(stakingMeta, staking_plan_id) {
    if (stakingMeta.staking_plan_id !== staking_plan_id) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: `This endpoint is only for ${staking_plan_id}`,
                error: {
                    staking_plan_id: stakingMeta.staking_plan_id,
                    required_plan: staking_plan_id
                }
            }
        };
    }
    return { valid: true };
}

/**
 * Validate withdrawal request body
 */
function validateWithdrawalRequest(body) {
    const errors = [];
    
    if (!body.request_id) errors.push('request_id is required');
    if (!body.user_id) errors.push('user_id is required');
    if (!body.amount_to_withdraw) errors.push('amount_to_withdraw is required');
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Validate ROI withdrawal timing
 */
function validateRoiWithdrawalTiming(stakingMetaData) {
    const staking_roi_next_withdrawal_duration_ts = parseInt(stakingMetaData.staking_roi_next_withdrawal_duration_ts);
    const now = Math.floor(Date.now() / 1000);
    
    if (now < staking_roi_next_withdrawal_duration_ts) {
        const remainingSeconds = staking_roi_next_withdrawal_duration_ts - now;
        return {
            error: {
                status: false,
                status_code: 400,
                message: `You cannot withdraw ROI before the next eligible withdrawal time ~ ${new Date(staking_roi_next_withdrawal_duration_ts * 1000).toLocaleString()}`,
                error: {
                    current_timestamp: now,
                    current_time_formatted: new Date(now * 1000).toLocaleString(),
                    next_withdrawal_timestamp: staking_roi_next_withdrawal_duration_ts,
                    next_withdrawal_time_formatted: new Date(staking_roi_next_withdrawal_duration_ts * 1000).toLocaleString(),
                    remaining_time_seconds: remainingSeconds,
                    remaining_time_formatted: formatRemainingTime(remainingSeconds)
                }
            }
        };
    }
    
    return { valid: true };
}

/**
 * Validate withdrawal amount
 */
function validateWithdrawalAmount(amount_to_withdraw, stakingMetrics) {
    const withdrawalAmount = parseFloat(amount_to_withdraw);
    const availableBalance = stakingMetrics.accumulated_roi_user_can_withdraw_now;
    
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
        return {
            status: false,
            status_code: 400,
            message: `Invalid withdrawal amount ~ ${amount_to_withdraw}`,
            error: { amount_to_withdraw, available_balance: availableBalance }
        };
    }
    
    if (withdrawalAmount > availableBalance) {
        return {
            status: false,
            status_code: 400,
            message: `Insufficient ROI balance for withdrawal, requested amount ${withdrawalAmount} is greater than available balance ${availableBalance}`,
            error: {
                requested_amount: withdrawalAmount,
                available_balance: availableBalance
            }
        };
    }
    
    return null; // No validation error
}

/**
 * Check if withdrawal already exists
 */
async function checkWithdrawalExists(stakingTransactionID, request_id) {
    try {
        const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        const response = await axios.get(stakingMetaUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY
            }
        });


        console.log('stakingMetaUrl', stakingMetaUrl);
        console.log('response', response.data.data);
        console.log('request_id', request_id);
        console.log('stakingTransactionID', stakingTransactionID);

        const existingWithdrawal = response.data.data[`staking_roi_payment_request_${stakingTransactionID}_${request_id}`];
        return existingWithdrawal || null;
    } catch (error) {
        console.error('Error checking withdrawal existence:', error);
        return null;
    }
}

/**
 * Check if ROI has been withdrawn internally
 */
function checkInternalRoiWithdrawn(stakingMetaData) {
    let amountWithdrawn = 0;
    let lastWithdrawalTs = null;
    
    // Check pattern-specific withdrawn amount
    if (stakingMetaData.staking_roi_payment_pattern === "internal_pattern_2") {
        amountWithdrawn = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0);
        lastWithdrawalTs = stakingMetaData.staking_roi_last_withdrawal_ts_internal_pattern_2;
    } else {
        amountWithdrawn = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far || 0);
        lastWithdrawalTs = stakingMetaData.staking_roi_last_withdrawal_ts;
    }
    
    return {
        hasWithdrawn: amountWithdrawn > 0,
        amountWithdrawn: amountWithdrawn,
        lastWithdrawalTs: lastWithdrawalTs
    };
}

/**
 * Check if external withdrawal has already been processed
 */
async function checkExternalWithdrawalExists(stakingTransactionID, user_id) {
    try {
        const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        const response = await axios.get(stakingMetaUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY
            }
        });

        const stakingMeta = response.data.data;
        
        // Check for external withdrawal indicators
        const externalWithdrawalProcessed = stakingMeta.staking_roi_external_withdrawal_processed;
        const externalWithdrawalTransactionId = stakingMeta.staking_roi_external_withdrawal_transaction_id;
        
        if (externalWithdrawalProcessed === 'yes' && externalWithdrawalTransactionId) {
            return {
                processed: externalWithdrawalProcessed,
                transaction_id: externalWithdrawalTransactionId,
                withdrawal_type: 'external_wallet',
                staking_transaction_id: stakingTransactionID
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error checking external withdrawal existence:', error);
        return null;
    }
}

/**
 * Check for pending transactions
 */
async function checkPendingTransactions(user_id, userBearerJWToken) {
    let transactionExists = "no"; // Default to "no" if check fails
    const transactionExistsCheckUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/user/${user_id}/utils/check-if-meta-value-exists?meta_key=pending_withdrawal_transaction_exists&meta_value=yes`;
    
    try {
        const transactionExistsResponse = await axios.get(transactionExistsCheckUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
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

    return transactionExists;
}

/**
 * Build ROI debit request body
 */
function buildRoiDebitRequestBody(request_id, user_id, amount_to_withdraw, staking_transaction_id, stakingMetaData, stakingMetrics) {
    return {
        request_id: `staking_roi_withdraw_debit_${staking_transaction_id}_${request_id}`,
        user_id: user_id,
        amount: amount_to_withdraw,
        wallet_id: stakingMetaData.staking_roi_payment_wallet_id_internal_pattern_2,
        note: `Staking ROI Withdrawal Debit - ${stakingMetaData.staking_plan_name}`,
        meta_data: {
            staking_transaction_id: stakingMetaData.id,
            staking_plan_id: stakingMetaData.staking_plan_id,
            staking_plan_name: stakingMetaData.staking_plan_name,
            transaction_action_type: 'staking_roi_withdrawal_debit',
            transaction_type_category: 'staking',
            transaction_external_processor: 'middleware1',
            transaction_approval_status: 'user_middleware_processed',
            transaction_approval_method: 'middleware'
        }
    };
}

/**
 * Build ROI credit request body
 */
function buildRoiCreditRequestBody(request_id, user_id, amount_to_withdraw, staking_transaction_id, stakingMetaData, stakingMetrics, debitTransactionId = null) {
    // For Plan 4, use pattern-specific withdrawn amount tracking
    let withdrawnAmountSoFar;
    if (stakingMetaData.staking_roi_payment_pattern === "internal_pattern_2") {
        withdrawnAmountSoFar = stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0;
    } else {
        withdrawnAmountSoFar = stakingMetrics.accumulated_roi_user_have_already_withdraw || 0;
    }
    
    return {
        request_id: `staking_roi_withdraw_credit_${staking_transaction_id}_${request_id}`,
        user_id: user_id,
        amount: amount_to_withdraw,
        wallet_id: stakingMetaData.staking_roi_payment_wallet_id_internal_pattern_2,
        note: `Staking ROI Withdrawal Credit - ${stakingMetaData.staking_plan_name}`,
        meta_data: {
            staking_transaction_id: stakingMetaData.id,
            staking_plan_id: stakingMetaData.staking_plan_id,
            staking_plan_name: stakingMetaData.staking_plan_name,
            staking_roi_amount_withdrawn_so_far: parseFloat(withdrawnAmountSoFar) + parseFloat(amount_to_withdraw),
            transaction_action_type: 'staking_roi_withdrawal_credit',
            transaction_type_category: 'staking',
            transaction_external_processor: 'middleware1',
            transaction_approval_status: 'user_middleware_processed',
            transaction_approval_method: 'middleware'
        }
    };
}

/**
 * Build update staking request body
 */
function buildUpdateStakingRequestBody(staking_transaction_id, stakingMetaData, amount_to_withdraw, currentTime, stakingMetrics, isExternal = false, withdrawalRequestTransactionId = null, request_id = null) {
    const intervalTs = TIMESTAMP_INTERVAL_VALUES[stakingMetaData.staking_roi_withdrawal_interval].ts;
    const nextWithdrawalTime = currentTime + intervalTs;
    
    const requestBody = {
        staking_roi_next_withdrawal_duration_ts: nextWithdrawalTime,
        staking_roi_last_withdrawal_ts: currentTime
    };
    
    // Update pattern-specific fields
    if (stakingMetaData.staking_roi_payment_pattern === "internal_pattern_2") {
        const currentWithdrawn = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0);
        const newWithdrawnAmount = currentWithdrawn + parseFloat(amount_to_withdraw);
        const totalRoiToBePaid = parseFloat(stakingMetaData.staking_total_roi_amount_to_be_paid_internal_pattern_2 || 0);
        const remainingAmount = totalRoiToBePaid - newWithdrawnAmount;
        
        requestBody.staking_roi_amount_withdrawn_so_far_internal_pattern_2 = newWithdrawnAmount;
        requestBody.staking_roi_amount_remaining_to_be_paid_internal_pattern_2 = Math.max(0, remainingAmount);
        requestBody.staking_roi_last_withdrawal_ts_internal_pattern_2 = currentTime;
    } else {
        const currentWithdrawn = parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far || 0);
        const newWithdrawnAmount = currentWithdrawn + parseFloat(amount_to_withdraw);
        const totalRoiToBePaid = parseFloat(stakingMetaData.staking_total_roi_amount_to_be_paid || 0);
        const remainingAmount = totalRoiToBePaid - newWithdrawnAmount;
        
        requestBody.staking_roi_amount_withdrawn_so_far = newWithdrawnAmount;
        requestBody.staking_roi_amount_remaining_to_be_paid = Math.max(0, remainingAmount);
    }
    
    // Mark external withdrawal as processed if applicable
    if (isExternal && withdrawalRequestTransactionId) {
        requestBody.staking_roi_external_withdrawal_processed = 'yes';
        requestBody.staking_roi_external_withdrawal_transaction_id = withdrawalRequestTransactionId;
    }
    
    // Save the request ID to track that this withdrawal has been processed
    if (request_id) {
        requestBody[`staking_roi_payment_request_${staking_transaction_id}_${request_id}`] = withdrawalRequestTransactionId;
    }
    
    return requestBody;
}

/**
 * Create debit transaction
 */
async function createDebitTransaction(userBearerJWToken, requestBody) {
    const debitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
    
    return await axios.post(debitUrl, requestBody, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });
}

/**
 * Create credit transaction
 */
async function createCreditTransaction(userBearerJWToken, requestBody) {
    const creditUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`;
    
    return await axios.post(creditUrl, requestBody, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });
}

/**
 * Update staking meta data
 */
async function updateStakingMeta(stakingTransactionID, userBearerJWToken, requestBody) {
    const updateMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
    
    return await axios.put(updateMetaUrl, requestBody, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });
}

/**
 * Update user's pending transaction status
 */
async function updateUserPendingTransactionStatus(user_id, userBearerJWToken, status = "yes") {
    const updateUserPendingTransactionExistsUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/user/${user_id}`;
    const updateUserPendingTransactionExistsRequestBody = {
        pending_withdrawal_transaction_exists: status
    };

    return await axios.put(updateUserPendingTransactionExistsUrl, updateUserPendingTransactionExistsRequestBody, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });
}

/**
 * Build external withdrawal debit request body
 */
function buildExternalWithdrawalDebitRequestBody($request_id, stakingTransactionID, user_id, amount_to_withdraw, wallet_id, blockchain_withdrawal_address_to, stakingMeta, debitTransactionId, creditTransactionId, staking_plan_id) {
    return {
        request_id: `external_roi_withdrawal_request_${stakingTransactionID}_${$request_id}`,
        user_id: String(user_id),
        amount: String(amount_to_withdraw),
        wallet_id: String(wallet_id),
        note: `External Wallet ROI Withdrawal Request ~ ${stakingMeta.staking_plan_name}`,
        meta_data: {
            blockchain_withdrawal_address_to: String(blockchain_withdrawal_address_to),
            transaction_status: 'pending',
            transaction_approval_status: 'admin_pending',
            transaction_action_type: `withdrawal_request_${staking_plan_id}`,
            transaction_type_category: 'withdrawals',
            transaction_processor: 'middleware',
            transaction_external_processor: 'administrator',
            transaction_requested_time: String(Date.now()),
            transaction_requested_by: String(user_id),
            staking_transaction_id: String(stakingTransactionID),
            staking_plan_id: String(stakingMeta.staking_plan_id),
            staking_plan_name: String(stakingMeta.staking_plan_name),
            staking_roi_withdraw_credit_transaction_id: String(creditTransactionId),
            withdrawal_type: 'external_wallet',
            withdrawal_source: `staking_roi_plan_${staking_plan_id}`
        }
    };
}

/**
 * Build success response for ROI withdrawal
 */
function buildRoiWithdrawalSuccessResponse(stakingTransactionID, stakingMeta, amount_to_withdraw, currentTime, debitTransactionId, creditTransactionId, isExternal = false, blockchain_withdrawal_address_to = null, withdrawalRequestTransactionId = null) {
    const response = {
        status: true,
        status_code: 200,
        message: `Staking ROI Withdrawal Completed Successfully`,
        data: {
            staking_transaction_id: stakingTransactionID,
            staking_plan_id: stakingMeta.staking_plan_id,
            staking_plan_name: stakingMeta.staking_plan_name,
            amount_withdrawn: amount_to_withdraw,
            roi_withdrawal_time: currentTime,
            roi_withdrawal_time_formatted: new Date(currentTime * 1000).toLocaleString(),
            debit_transaction_id: debitTransactionId,
            credit_transaction_id: creditTransactionId,
            processed_at: currentTime
        }
    };

    if (isExternal) {
        response.data.blockchain_withdrawal_address_to = blockchain_withdrawal_address_to;
        response.data.withdrawal_request_transaction_id = withdrawalRequestTransactionId;
    }

    return response;
}

/**
 * Build error response for internal withdrawal already processed
 */
function buildInternalRoiWithdrawalBlockedError(stakingTransactionID, stakingMeta, internalRoiWithdrawn) {
    return {
        status: false,
        status_code: 400,
        message: `ROI has already been withdrawn internally. External withdrawal is not allowed after internal withdrawal.`,
        details: {
            staking_transaction_id: stakingTransactionID,
            staking_plan_id: stakingMeta.staking_plan_id,
            staking_plan_name: stakingMeta.staking_plan_name,
            roi_withdrawn_so_far: internalRoiWithdrawn.amountWithdrawn,
            last_withdrawal_ts: internalRoiWithdrawn.lastWithdrawalTs,
            withdrawal_type: 'external_wallet_blocked',
            reason: 'internal_withdrawal_already_processed'
        }
    };
}

/**
 * Build error response for external withdrawal already processed
 */
function buildExternalRoiWithdrawalExistsError(stakingTransactionID, stakingMeta, externalWithdrawalExists) {
    return {
        status: false,
        status_code: 400,
        message: `External withdrawal has already been processed for this staking transaction`,
        details: {
            staking_transaction_id: stakingTransactionID,
            staking_plan_id: stakingMeta.staking_plan_id,
            staking_plan_name: stakingMeta.staking_plan_name,
            existing_external_withdrawal: externalWithdrawalExists,
            withdrawal_type: 'external_wallet'
        }
    };
}

/**
 * Build error response for pending transactions
 */
function buildPendingTransactionError(transactionExists) {
    return {
        status: false,
        status_code: 400,
        message: "A pending transaction request already exists",
        error: {
            message: `Transaction exists with state: ${transactionExists}`,
            recommendation: "Wait for transaction state to change",
            error_data: transactionExists
        }
    };
}

/**
 * Build error response for insufficient ROI balance
 */
function buildInsufficientRoiBalanceError(stakingMetrics, stakingMeta) {
    return {
        status: false,
        status_code: 400,
        message: "No ROI available for withdrawal",
        error: {
            available_roi: stakingMetrics.accumulated_roi_user_can_withdraw_now,
            total_accumulated_roi: stakingMetrics.accumulated_roi_now,
            already_withdrawn: stakingMetrics.accumulated_roi_user_have_already_withdraw,
            staking_plan_id: stakingMeta.staking_plan_id,
            staking_plan_name: stakingMeta.staking_plan_name
        }
    };
}

// ============================================================================
// FEE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Check if user has sufficient balance for withdrawal fee
 * @param {string} userBearerJWToken - JWT token for API authentication
 * @param {string} fee_amount - Amount of fee to check
 * @param {string} fee_wallet - Wallet ID to check balance for
 * @param {string} user_id - User ID for the balance check
 * @returns {Object} Result object with success/error status
 */
async function checkUserFeeBalance(userBearerJWToken, fee_amount, fee_wallet, user_id) {
    try {
        const balanceCheckUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/user-wallet-balance?wallet_id=${fee_wallet}&user_id=${user_id}`;
        
        const response = await axios.get(balanceCheckUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        if (response.data.status && response.data.data) {
            // Extract user balance, defaulting to 0 if null or empty
            const userBalance = parseFloat(response.data.data.wallet_balance_raw || 0);
            const requiredFee = parseFloat(fee_amount);
            
            if (userBalance >= requiredFee) {
                return {
                    status: true,
                    message: 'User has sufficient balance for fee',
                    data: {
                        user_balance: userBalance,
                        required_fee: requiredFee,
                        remaining_balance: userBalance - requiredFee,
                        wallet_balance_raw: response.data.data.wallet_balance_raw,
                        wallet_balance_formatted: response.data.data.wallet_balance_formatted
                    }
                };
            } else {
                return {
                    status: false,
                    error: {
                        status: false,
                        status_code: 400,
                        message: `Insufficient balance for withdrawal fee. Required: ${requiredFee}, Available: ${userBalance}`,
                        error: {
                            msg: `Fee Amount ${requiredFee} is greater than Wallet balance ${userBalance}`,
                            recommendation: "Fee Amount should not be greater than Wallet balance",
                            required_fee: requiredFee,
                            available_balance: userBalance,
                            shortfall: requiredFee - userBalance,
                            error_data: response.data.data
                        }
                    }
                };
            }
        } else {
            return {
                status: false,
                error: {
                    status: false,
                    status_code: 400,
                    message: 'Failed to retrieve user balance for fee check',
                    error: response.data
                }
            };
        }
    } catch (error) {
        console.log("Error in checkUserFeeBalance:", error);
        return {
            status: false,
            error: {
                status: false,
                status_code: 500,
                message: 'Error checking user fee balance',
                error: {
                    message: error.message,
                    details: error.response?.data || null
                }
            }
        };
    }
}

/**
 * Deduct withdrawal fee from user's wallet
 * @param {string} userBearerJWToken - JWT token for API authentication
 * @param {string} fee_amount - Amount of fee to deduct
 * @param {string} fee_wallet - Wallet ID to deduct from
 * @param {string} user_id - User ID for the transaction
 * @param {string} stakingTransactionID - Staking transaction ID for reference
 * @returns {Object} Result object with success/error status
 */
async function deductUserFee(userBearerJWToken, fee_amount, fee_wallet, user_id, stakingTransactionID) {
    try {
        const feeDebitRequestBody = {
            request_id: `fee_staking_roi_withdrawal_debit_${stakingTransactionID}`,
            user_id: String(user_id),
            amount: String(fee_amount),
            wallet_id: String(fee_wallet),
            note: `Fee - Staking ROI Withdrawal`,
            meta_data: {
                staking_transaction_id: String(stakingTransactionID),
                transaction_action_type: 'staking_roi_withdrawal_fee',
                transaction_type_category: 'fees',
                transaction_processor: 'middleware',
                transaction_approval_status: 'user_middleware_processed',
                transaction_approval_method: 'middleware'
            }
        };

        const response = await axios.post(`${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`, feeDebitRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.status) {
            return {
                status: true,
                message: 'Fee deducted successfully',
                data: response.data.data
            };
        } else {
            return {
                status: false,
                error: {
                    status: false,
                    status_code: 400,
                    message: 'Failed to deduct withdrawal fee',
                    error: response.data
                }
            };
        }
    } catch (error) {
        return {
            status: false,
            error: {
                status: false,
                status_code: 500,
                message: 'Error deducting withdrawal fee',
                error: {
                    message: error.message,
                    details: error.response?.data || null
                }
            }
        };
    }
}

/**
 * Credit the deducted fee to fee user
 * @param {string} userBearerJWToken - JWT token for API authentication
 * @param {string} fee_amount - Amount of fee to credit
 * @param {string} fee_wallet - Wallet ID to credit to
 * @param {string} stakingTransactionID - Staking transaction ID for reference
 * @param {string} user_id - User ID who paid the fee
 * @returns {Object} Result object with success/error status
 */
async function creditFeeToFeeUser(userBearerJWToken, fee_amount, fee_wallet, stakingTransactionID, user_id) {
    try {
        const creditRequestBody = {
            request_id: `fee_staking_roi_withdrawal_credit_${stakingTransactionID}`,
            user_id: 1, // Credit to fee user
            amount: String(fee_amount),
            wallet_id: String(fee_wallet),
            note: `Fee - Staking ROI Withdrawal`,
            meta_data: {
                staking_transaction_id: String(stakingTransactionID),
                user_id_fee_payer: String(user_id),
                transaction_action_type: "fee_staking_roi_withdrawal",
                transaction_type_category: "fee_staking_withdrawal",
                transaction_external_processor: "middleware1_module1",
                transaction_approval_status: "user_middleware_processed",
                transaction_approval_method: "middleware"
            }
        };

        const response = await axios.post(`${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`, creditRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.status) {
            return {
                status: true,
                message: 'Fee credited to user successfully',
                data: response.data.data
            };
        } else {
            return {
                status: false,
                error: {
                    status: false,
                    status_code: 400,
                    message: 'Failed to credit fee to user',
                    error: response.data
                }
            };
        }
    } catch (error) {
        return {
            status: false,
            error: {
                status: false,
                status_code: 500,
                message: 'Error crediting fee to user',
                error: {
                    message: error.message,
                    details: error.response?.data || null
                }
            }
        };
    }
}

module.exports = {
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
};

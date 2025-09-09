const axios = require('axios');
const { Web3 } = require('web3');

// Environment variables
const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

// Simple in-memory cache for staking meta data
const stakingMetaCache = new Map();
const CACHE_TTL = 30000; // 30 seconds cache

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
    return { userBearerJWToken: req.headers.authorization.split(' ')[1] };
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
    const stakingMetaResponse = await axios.get(stakingMetaUrl, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY,
            'Authorization': `Bearer ${userBearerJWToken}`
        }
    });
    
    const data = stakingMetaResponse.data.data;
    
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
 * Validate Plan 4 staking
 */
function validatePlanStaking(stakingMeta, staking_plan_id) {
    if (stakingMeta.staking_plan_id !== staking_plan_id) {
        return {
            error: {
                status: false,
                status_code: 400,
                message: `This endpoint is only for ${staking_plan_id} staking transactions`,
                error: {
                    staking_plan_id: stakingMeta.staking_plan_id,
                    required_plan: 'staking_plan_id '
                }
            }
        };
    }
    return { valid: true };
}

/**
 * Check if capital has already been withdrawn
 */
function checkCapitalAlreadyWithdrawn(stakingMeta, stakingTransactionID) {
    if (stakingMeta.staking_capital_withdrawn && stakingMeta.staking_capital_withdrawn.toString().toLowerCase() === 'yes') {
        return {
            error: {
                status: false,
                status_code: 400,
                message: `Capital has already been withdrawn for this staking transaction`,
                details: {
                    staking_transaction_id: stakingTransactionID,
                    staking_plan_id: stakingMeta.staking_plan_id,
                    staking_plan_name: stakingMeta.staking_plan_name,
                    staking_capital_withdrawn: stakingMeta.staking_capital_withdrawn,
                    staking_capital_withdrawn_at: stakingMeta.staking_capital_withdrawn_at,
                    staking_capital_withdraw_debit_transaction_id: stakingMeta.staking_capital_withdraw_debit_transaction_id,
                    staking_capital_withdraw_credit_transaction_id: stakingMeta.staking_capital_withdraw_credit_transaction_id
                }
            }
        };
    }
    return { valid: true };
}

/**
 * Validate capital withdrawal timing based on duration setting
 */
function validateCapitalWithdrawalTiming(stakingMeta, stakingTransactionID) {
    const currentTime = Math.floor(Date.now() / 1000);
    const capitalLockedDurationTs = parseInt(stakingMeta.staking_capital_locked_duration_ts);
    
    // Check if the capital locked duration has passed
    if (currentTime < capitalLockedDurationTs) {
        const remainingTime = capitalLockedDurationTs - currentTime;
        const capitalLockedDuration = parseInt(stakingMeta.staking_capital_locked_duration) || 0;
        
        return {
            error: {
                status: false,
                status_code: 400,
                message: 'Capital withdrawal not yet allowed until ' + new Date(capitalLockedDurationTs * 1000).toLocaleString(),
                details: {
                    staking_transaction_id: stakingTransactionID,
                    staking_plan_id: stakingMeta.staking_plan_id,
                    staking_plan_name: stakingMeta.staking_plan_name,
                    current_timestamp: currentTime,
                    current_time_formatted: new Date(currentTime * 1000).toLocaleString(),
                    capital_locked_until_timestamp: capitalLockedDurationTs,
                    capital_locked_until_formatted: new Date(capitalLockedDurationTs * 1000).toLocaleString(),
                    remaining_time_seconds: remainingTime,
                    capital_locked_duration: capitalLockedDuration,
                    note: capitalLockedDuration > 0 
                        ? `Capital is locked for ${capitalLockedDuration} intervals from staking start time`
                        : `Capital is locked until ${new Date(capitalLockedDurationTs * 1000).toLocaleString()}`
                }
            }
        };
    }
    return { valid: true };
}

/**
 * Extract required fields from staking meta
 */
function extractStakingFields(stakingMeta) {
    return {
        staking_capital_payment_wallet_id: stakingMeta.staking_capital_payment_wallet_id,
        staking_amount: parseFloat(stakingMeta.staking_amount),
        user_id: stakingMeta.user_id,
        staking_locked_wallet_id: stakingMeta.staking_capital_locked_wallet_id || `${stakingMeta.staking_capital_payment_wallet_id}_staking_locked`
    };
}

/**
 * Build debit request body for capital withdrawal
 */
function buildCapitalDebitRequestBody(request_id, user_id, stakingTransactionID, staking_amount, staking_locked_wallet_id, stakingMeta, isExternal = false) {
    const externalSuffix = isExternal ? '_external' : '';
    const externalNote = isExternal ? 'External ' : '';
    
    return {
        request_id: `staking_capital_withdraw_debit_${stakingTransactionID}`,
        user_id: String(user_id),
        amount: String(staking_amount),
        wallet_id: String(staking_locked_wallet_id),
        note: `${externalNote} Staking Capital Withdrawal Debit`,
        meta_data: {
            staking_transaction_id: String(stakingTransactionID),
            staking_plan_id: String(stakingMeta.staking_plan_id),
            staking_plan_name: String(stakingMeta.staking_plan_name),
            transaction_action_type: `plan4_staking_capital_withdrawal${externalSuffix}_debit`,
            transaction_type_category: 'staking',
            transaction_external_processor: 'middleware1',
            transaction_approval_status: 'user_middleware_processed',
            transaction_approval_method: 'middleware'
        }
    };
}

/**
 * Build credit request body for capital withdrawal
 */
function buildCapitalCreditRequestBody(request_id, user_id, stakingTransactionID, staking_amount, staking_capital_payment_wallet_id, stakingMeta, debitTransactionId, isExternal = false) {
    const externalSuffix = isExternal ? '_external' : '';
    const externalNote = isExternal ? 'External ' : '';
    
    return {
        request_id: `staking_capital_withdraw_credit_${stakingTransactionID}`,
        user_id: String(user_id),
        amount: String(staking_amount),
        wallet_id: String(staking_capital_payment_wallet_id),
        note: `${externalNote} Staking Capital Withdrawal Credit`,
        meta_data: {
            staking_transaction_id: String(stakingTransactionID),
            staking_alt_transaction_id: String(debitTransactionId),
            staking_plan_id: String(stakingMeta.staking_plan_id),
            staking_plan_name: String(stakingMeta.staking_plan_name),
            transaction_action_type: `plan4_staking_capital_withdrawal${externalSuffix}_credit`,
            transaction_type_category: 'staking',
            transaction_external_processor: 'middleware1',
            transaction_approval_status: 'user_middleware_processed',
            transaction_approval_method: 'middleware'
        }
    };
}

/**
 * Build update meta request body for capital withdrawal
 */
function buildCapitalUpdateMetaRequestBody(debitTransactionId, creditTransactionId, currentTime, stakingTransactionID, stakingMeta, isExternal = false, blockchainWithdrawalAddress = null, withdrawalRequestTransactionId = null) {
    const requestBody = {
        staking_capital_withdrawn: 'yes',
        staking_capital_withdrawn_at: currentTime,
        staking_capital_withdraw_debit_transaction_id: debitTransactionId,
        staking_capital_withdraw_credit_transaction_id: creditTransactionId,
        staking_roi_payment_endtime_ts: currentTime,
        staking_roi_payment_endtime_ts_internal_pattern_2: currentTime
    };

    if (isExternal) {
        if (blockchainWithdrawalAddress) {
            requestBody.blockchain_withdrawal_address_to = blockchainWithdrawalAddress;
        }
        if (withdrawalRequestTransactionId) {
            requestBody.withdrawal_request_transaction_id = withdrawalRequestTransactionId;
        }
        // Mark external withdrawal as processed
        requestBody.staking_capital_external_withdrawal_processed = 'yes';
        requestBody.staking_capital_external_withdrawal_transaction_id = withdrawalRequestTransactionId;
    }

    return requestBody;
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
        const externalWithdrawalProcessed = stakingMeta.staking_capital_external_withdrawal_processed;
        const externalWithdrawalTransactionId = stakingMeta.staking_capital_external_withdrawal_transaction_id;
        
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
 * Build external withdrawal debit request body
 */
function buildExternalWithdrawalDebitRequestBody(stakingTransactionID, user_id, staking_amount, staking_capital_payment_wallet_id, blockchain_withdrawal_address_to, stakingMeta, debitTransactionId, creditTransactionId, staking_plan_id) {
    return {
        request_id: `staking_capital_external_withdrawal_request_${stakingTransactionID}`,
        user_id: String(user_id),
        amount: String(staking_amount),
        wallet_id: String(staking_capital_payment_wallet_id),
        note: `External Wallet Withdrawal Request`,
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
            staking_capital_withdraw_debit_transaction_id: String(debitTransactionId),
            staking_capital_withdraw_credit_transaction_id: String(creditTransactionId),
            withdrawal_type: 'external_wallet',
            withdrawal_source: `staking_capital_plan_${staking_plan_id}`
        }
    };
}

/**
 * Build success response for capital withdrawal
 */
function buildCapitalWithdrawalSuccessResponse(stakingTransactionID, stakingMeta, staking_amount, currentTime, debitTransactionId, creditTransactionId, isExternal = false, blockchain_withdrawal_address_to = null, withdrawalRequestTransactionId = null) {
    const response = {
        status: true,
        status_code: 200,
        message: `Staking Capital ${isExternal ? 'External ' : ''}Withdrawal Completed Successfully`,
        data: {
            staking_transaction_id: stakingTransactionID,
            staking_plan_id: stakingMeta.staking_plan_id,
            staking_plan_name: stakingMeta.staking_plan_name,
            staking_amount: staking_amount,
            capital_withdrawal_time: currentTime,
            capital_withdrawal_time_formatted: new Date(currentTime * 1000).toLocaleString(),
            debit_transaction_id: debitTransactionId,
            credit_transaction_id: creditTransactionId,
            roi_payment_endtime_updated: currentTime,
            roi_payment_endtime_updated_formatted: new Date(currentTime * 1000).toLocaleString(),
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
function buildInternalWithdrawalBlockedError(stakingTransactionID, stakingMeta) {
    return {
        status: false,
        status_code: 400,
        message: `Capital has already been withdrawn internally. External withdrawal is not allowed after internal withdrawal.`,
        details: {
            staking_transaction_id: stakingTransactionID,
            staking_plan_id: stakingMeta.staking_plan_id,
            staking_plan_name: stakingMeta.staking_plan_name,
            capital_withdrawn: stakingMeta.staking_capital_withdrawn,
            capital_withdrawn_at: stakingMeta.staking_capital_withdrawn_at,
            withdrawal_type: 'external_wallet_blocked',
            reason: 'internal_withdrawal_already_processed'
        }
    };
}

/**
 * Check if internal withdrawal has already been processed (for external withdrawal blocking)
 */
function checkInternalWithdrawalBlocked(stakingMeta, stakingTransactionID) {
    if (stakingMeta.staking_capital_withdrawn && stakingMeta.staking_capital_withdrawn.toString().toLowerCase() === 'yes') {
        return {
            error: buildInternalWithdrawalBlockedError(stakingTransactionID, stakingMeta)
        };
    }
    return { valid: true };
}

/**
 * Build error response for external withdrawal already processed
 */
function buildExternalWithdrawalExistsError(stakingTransactionID, stakingMeta, externalWithdrawalExists) {
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
 * Build error response for timing validation
 */
function buildTimingValidationError(stakingTransactionID, stakingMeta, timingDetails) {
    return {
        status: false,
        status_code: 400,
        message: 'Capital withdrawal is not allowed until ' + new Date(timingDetails.capital_locked_until_timestamp * 1000).toLocaleString(),
        details: {
            staking_transaction_id: stakingTransactionID,
            staking_plan_id: stakingMeta.staking_plan_id,
            staking_plan_name: stakingMeta.staking_plan_name,
            withdrawal_type: 'external_wallet_blocked',
            reason: 'capital_still_locked',
            timing_details: timingDetails
        }
    };
}

module.exports = {
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
    invalidateStakingMetaCache
};

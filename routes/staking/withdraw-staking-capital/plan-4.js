const express = require('express');
const axios = require('axios');
const { Web3 } = require('web3');
const router = express.Router();
const { 
    getStakingCapitalMetrics,
    calculateStakingCapitalMetricsFromMetaData,
    formatRemainingTime 
} = require('../utils');

// Cache for staking meta data
const stakingMetaCache = new Map();
const CACHE_TTL = 30000; // 30 seconds cache

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

// POST /staking/withdraw-staking-capital/plan-4/:stakingTransactionID
router.post('/:stakingTransactionID', async (req, res) => {
    try {
        const stakingTransactionID = req.params.stakingTransactionID;
        const { request_id, amount_to_withdraw } = req.body;

        // Check for JWT Bearer token
        if (!req.headers.authorization) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'JWT Token required',
                error: { error_data: req.headers.authorization }
            });
        }
        const userBearerJWToken = req.headers.authorization.split(' ')[1];

        // Fetch staking meta data
        const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        const stakingMetaResponse = await axios.get(stakingMetaUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });
        const stakingMeta = stakingMetaResponse.data.data;

        // Validate that this is a Plan 4 staking
        if (stakingMeta.staking_plan_id !== 'plan_4') {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'This endpoint is only for Plan 4 staking transactions',
                error: {
                    staking_plan_id: stakingMeta.staking_plan_id,
                    required_plan: 'plan_4'
                }
            });
        }

        // Extract required fields
        const staking_capital_payment_wallet_id = stakingMeta.staking_capital_payment_wallet_id;
        const staking_amount = parseFloat(stakingMeta.staking_amount);
        const user_id = stakingMeta.user_id;
        const staking_locked_wallet_id = stakingMeta.staking_capital_locked_wallet_id || `${staking_capital_payment_wallet_id}_staking_locked`;

        // Check if capital has already been withdrawn
        if (stakingMeta.staking_capital_withdrawn && stakingMeta.staking_capital_withdrawn.toString().toLowerCase() === 'yes') {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'Capital has already been withdrawn for this Plan 4 staking transaction',
                details: {
                    staking_transaction_id: stakingTransactionID,
                    staking_plan_id: stakingMeta.staking_plan_id,
                    staking_plan_name: stakingMeta.staking_plan_name,
                    staking_capital_withdrawn: stakingMeta.staking_capital_withdrawn,
                    staking_capital_withdrawn_at: stakingMeta.staking_capital_withdrawn_at,
                    staking_capital_withdraw_debit_transaction_id: stakingMeta.staking_capital_withdraw_debit_transaction_id,
                    staking_capital_withdraw_credit_transaction_id: stakingMeta.staking_capital_withdraw_credit_transaction_id
                }
            });
        }

        // Calculate capital metrics using utils
        const capitalMetrics = calculateStakingCapitalMetricsFromMetaData(stakingMeta);
        
        // For Plan 4, capital can always be withdrawn (instant withdrawal)
        if (!capitalMetrics.can_withdraw_capital) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'Capital withdrawal not allowed for this Plan 4 staking',
                details: {
                    staking_parent_transaction_id: stakingTransactionID,
                    staking_plan_id: stakingMeta.staking_plan_id,
                    staking_plan_name: stakingMeta.staking_plan_name,
                    can_withdraw_capital: capitalMetrics.can_withdraw_capital,
                    current_timestamp: capitalMetrics.current_timestamp,
                    current_time_formatted: new Date(capitalMetrics.current_timestamp * 1000).toLocaleString()
                }
            });
        }

        // Step 1: Debit the locked staking wallet
        const debitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
        const debitRequestBody = {
            request_id: `plan4_staking_capital_withdraw_request_${request_id}`,
            user_id: user_id,
            amount: staking_amount,
            wallet_id: staking_locked_wallet_id,
            note: 'Plan 4 Staking Capital Withdrawal Request',
            meta_data: {
                staking_transaction_id: stakingTransactionID,
                staking_plan_id: stakingMeta.staking_plan_id,
                staking_plan_name: stakingMeta.staking_plan_name,
                transaction_action_type: 'plan4_staking_capital_withdrawal_debit',
                transaction_type_category: 'staking',
                transaction_external_processor: 'middleware1',
                transaction_approval_status: 'user_middleware_processed',
                transaction_approval_method: 'middleware'
            }
        };

        const debitResponse = await axios.post(debitUrl, debitRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Step 2: Credit the main wallet
        const creditUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`;
        const creditRequestBody = {
            request_id: `plan4_staking_capital_withdraw_credit_${request_id}`,
            user_id: user_id,
            amount: staking_amount,
            wallet_id: staking_capital_payment_wallet_id,
            note: 'Plan 4 Staking Capital Withdrawal Credit',
            meta_data: {
                staking_transaction_id: stakingTransactionID,
                staking_alt_transaction_id: debitResponse.data.data.transaction_id,
                staking_plan_id: stakingMeta.staking_plan_id,
                staking_plan_name: stakingMeta.staking_plan_name,
                transaction_action_type: 'plan4_staking_capital_withdrawal_credit',
                transaction_type_category: 'staking',
                transaction_external_processor: 'middleware1',
                transaction_approval_status: 'user_middleware_processed',
                transaction_approval_method: 'middleware'
            }
        };

        const creditResponse = await axios.post(creditUrl, creditRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Step 3: Update staking meta with withdrawal information
        const currentTime = Math.floor(Date.now() / 1000);
        const updateMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        
        // For Plan 4, update ROI end time to current time when capital is withdrawn
        const updateMetaRequestBody = {
            staking_capital_withdrawn: 'yes',
            staking_capital_withdrawn_at: currentTime,
            staking_capital_withdraw_debit_transaction_id: debitResponse.data.data.transaction_id,
            staking_capital_withdraw_credit_transaction_id: creditResponse.data.data.transaction_id,
            staking_roi_payment_endtime_ts: currentTime,
            staking_roi_payment_endtime_ts_internal_pattern_2: currentTime
        };

        const updateMetaResponse = await axios.put(updateMetaUrl, updateMetaRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Success response
        return res.status(200).json({
            status: true,
            status_code: 200,
            message: 'Plan 4 Staking Capital Withdrawal Completed Successfully',
            data: {
                staking_transaction_id: stakingTransactionID,
                staking_plan_id: stakingMeta.staking_plan_id,
                staking_plan_name: stakingMeta.staking_plan_name,
                staking_amount: staking_amount,
                amount_withdrawn: staking_amount,
                capital_withdrawal_time: currentTime,
                capital_withdrawal_time_formatted: new Date(currentTime * 1000).toLocaleString(),
                debit_transaction_id: debitResponse.data.data.transaction_id,
                credit_transaction_id: creditResponse.data.data.transaction_id,
                roi_payment_endtime_updated: currentTime,
                roi_payment_endtime_updated_formatted: new Date(currentTime * 1000).toLocaleString(),
                note: 'Plan 4 allows instant capital withdrawal. ROI accumulation stops at capital withdrawal time.',
                processed_at: currentTime
            }
        });

    } catch (error) {
        console.error('Plan 4 Capital Withdrawal Error:', error);
        
        // Handle specific error cases
        if (error.response) {
            return res.status(error.response.status).json({
                status: false,
                status_code: error.response.status,
                message: 'Plan 4 Capital Withdrawal Failed',
                error: {
                    api_error: error.response.data,
                    staking_transaction_id: req.params.stakingTransactionID
                }
            });
        }

        return res.status(400).json({
            status: false,
            status_code: 400,
            message: 'Internal server error during Plan 4 capital withdrawal',
            error: {
                message: error.message,
                staking_transaction_id: req.params.stakingTransactionID
            }
        });
    }
});

// POST /staking/withdraw-staking-capital/plan-4/external/:stakingTransactionID
router.post('/blockchain-external/:stakingTransactionID', async (req, res) => {
    try {
        const stakingTransactionID = req.params.stakingTransactionID;
        const { request_id, amount_to_withdraw, blockchain_withdrawal_address_to } = req.body;

        // Check for JWT Bearer token
        if (!req.headers.authorization) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'JWT Token required',
                error: { error_data: req.headers.authorization }
            });
        }
        const userBearerJWToken = req.headers.authorization.split(' ')[1];

        // Validate blockchain_withdrawal_address_to
        if (!blockchain_withdrawal_address_to) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'Blockchain withdrawal address is required',
                error: {
                    message: 'blockchain_withdrawal_address_to is required for external withdrawals',
                    recommendation: 'Provide a valid EVM address',
                    error_data: blockchain_withdrawal_address_to
                }
            });
        }

        // Validate EVM address format
        if (!web3 || !web3.utils.isAddress(blockchain_withdrawal_address_to)) {
            return res.status(400).json({
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
            });
        }

        // Fetch staking meta data
        const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        const stakingMetaResponse = await axios.get(stakingMetaUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });
        const stakingMeta = stakingMetaResponse.data.data;

        // Validate that this is a Plan 4 staking
        if (stakingMeta.staking_plan_id !== 'plan_4') {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'This endpoint is only for Plan 4 staking transactions',
                error: {
                    staking_plan_id: stakingMeta.staking_plan_id,
                    required_plan: 'plan_4'
                }
            });
        }

        // Extract required fields
        const staking_capital_payment_wallet_id = stakingMeta.staking_capital_payment_wallet_id;
        const staking_amount = parseFloat(stakingMeta.staking_amount);
        const user_id = stakingMeta.user_id;
        const staking_locked_wallet_id = stakingMeta.staking_capital_locked_wallet_id || `${staking_capital_payment_wallet_id}_staking_locked`;

        // Perform transaction existence check
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

        // Check if capital has already been withdrawn
        if (stakingMeta.staking_capital_withdrawn && stakingMeta.staking_capital_withdrawn.toString().toLowerCase() === 'yes') {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'Capital has already been withdrawn for this Plan 4 staking transaction',
                details: {
                    staking_transaction_id: stakingTransactionID,
                    staking_plan_id: stakingMeta.staking_plan_id,
                    staking_plan_name: stakingMeta.staking_plan_name,
                    staking_capital_withdrawn: stakingMeta.staking_capital_withdrawn,
                    staking_capital_withdrawn_at: stakingMeta.staking_capital_withdrawn_at,
                    staking_capital_withdraw_debit_transaction_id: stakingMeta.staking_capital_withdraw_debit_transaction_id,
                    staking_capital_withdraw_credit_transaction_id: stakingMeta.staking_capital_withdraw_credit_transaction_id
                }
            });
        }

        // Calculate capital metrics using utils
        const capitalMetrics = calculateStakingCapitalMetricsFromMetaData(stakingMeta);
        
        // For Plan 4, capital can always be withdrawn (instant withdrawal)
        if (!capitalMetrics.can_withdraw_capital) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'Capital withdrawal not allowed for this Plan 4 staking',
                details: {
                    staking_parent_transaction_id: stakingTransactionID,
                    staking_plan_id: stakingMeta.staking_plan_id,
                    staking_plan_name: stakingMeta.staking_plan_name,
                    can_withdraw_capital: capitalMetrics.can_withdraw_capital,
                    current_timestamp: capitalMetrics.current_timestamp,
                    current_time_formatted: new Date(capitalMetrics.current_timestamp * 1000).toLocaleString()
                }
            });
        }

        // Step 1: Debit the locked staking wallet
        const debitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
        const debitRequestBody = {
            request_id: `plan4_staking_capital_external_withdraw_request_${request_id}`,
            user_id: user_id,
            amount: staking_amount,
            wallet_id: staking_locked_wallet_id,
            note: 'Staking Capital Withdrawal Request',
            meta_data: {
                staking_transaction_id: stakingTransactionID,
                staking_plan_id: stakingMeta.staking_plan_id,
                staking_plan_name: stakingMeta.staking_plan_name,
                blockchain_withdrawal_address_to: blockchain_withdrawal_address_to,
                transaction_action_type: 'plan4_staking_capital_external_withdrawal_debit',
                transaction_type_category: 'staking',
                transaction_external_processor: 'middleware1',
                transaction_approval_status: 'user_middleware_processed',
                transaction_approval_method: 'middleware'
            }
        };

        const debitResponse = await axios.post(debitUrl, debitRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Step 2: Credit the main wallet
        const creditUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`;
        const creditRequestBody = {
            request_id: `plan4_staking_capital_external_withdraw_credit_${request_id}`,
            user_id: user_id,
            amount: staking_amount,
            wallet_id: staking_capital_payment_wallet_id,
            note: 'Staking Capital Withdrawal Credit',
            meta_data: {
                staking_transaction_id: stakingTransactionID,
                staking_alt_transaction_id: debitResponse.data.data.transaction_id,
                staking_plan_id: stakingMeta.staking_plan_id,
                staking_plan_name: stakingMeta.staking_plan_name,
                blockchain_withdrawal_address_to: blockchain_withdrawal_address_to,
                transaction_action_type: 'plan4_staking_capital_external_withdrawal_credit',
                transaction_type_category: 'staking',
                transaction_external_processor: 'middleware1',
                transaction_approval_status: 'user_middleware_processed',
                transaction_approval_method: 'middleware'
            }
        };

        const creditResponse = await axios.post(creditUrl, creditRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        // Step 3: Update staking meta with withdrawal information
        const currentTime = Math.floor(Date.now() / 1000);
        const updateMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        
        // For Plan 4, update ROI end time to current time when capital is withdrawn
        const updateMetaRequestBody = {
            staking_capital_withdrawn: 'yes',
            staking_capital_withdrawn_at: currentTime,
            staking_capital_withdraw_debit_transaction_id: debitResponse.data.data.transaction_id,
            staking_capital_withdraw_credit_transaction_id: creditResponse.data.data.transaction_id,
            staking_roi_payment_endtime_ts: currentTime,
            staking_roi_payment_endtime_ts_internal_pattern_2: currentTime,
            blockchain_withdrawal_address_to: blockchain_withdrawal_address_to,
            withdrawal_request_transaction_id: withdrawalDebitResponse.data.data.transaction_id
        };

        const updateMetaResponse = await axios.put(updateMetaUrl, updateMetaRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });


        // Step 4: Submit withdrawal request to external wallet (debit transaction)
        const withdrawalDebitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
        const withdrawalDebitRequestBody = {
            request_id: `external_withdrawal_request_${request_id}`,
            user_id: user_id,
            amount: staking_amount,
            wallet_id: staking_capital_payment_wallet_id,
            note: `External Wallet Withdrawal Request for Plan 4 Staking`,
            meta_data: {
                blockchain_withdrawal_address_to: blockchain_withdrawal_address_to,
                transaction_status: 'pending',
                transaction_approval_status: 'admin_pending',
                transaction_action_type: 'withdrawal_request',
                transaction_type_category: 'withdrawals',
                transaction_processor: 'middleware',
                transaction_external_processor: 'administrator',
                transaction_requested_time: Date.now(),
                transaction_requested_by: user_id,
                staking_transaction_id: stakingTransactionID,
                staking_plan_id: stakingMeta.staking_plan_id,
                staking_plan_name: stakingMeta.staking_plan_name,
                staking_capital_withdraw_debit_transaction_id: debitResponse.data.data.transaction_id,
                staking_capital_withdraw_credit_transaction_id: creditResponse.data.data.transaction_id,
                withdrawal_type: 'external_wallet',
                withdrawal_source: 'staking_capital_plan_4'
            }
        };

        const withdrawalDebitResponse = await axios.post(withdrawalDebitUrl, withdrawalDebitRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        
        // Success response
        return res.status(200).json({
            status: true,
            status_code: 200,
            message: 'Plan 4 Staking Capital External Withdrawal Completed Successfully',
            data: {
                staking_transaction_id: stakingTransactionID,
                staking_plan_id: stakingMeta.staking_plan_id,
                staking_plan_name: stakingMeta.staking_plan_name,
                staking_amount: staking_amount,
                amount_withdrawn: staking_amount,
                blockchain_withdrawal_address_to: blockchain_withdrawal_address_to,
                capital_withdrawal_time: currentTime,
                capital_withdrawal_time_formatted: new Date(currentTime * 1000).toLocaleString(),
                debit_transaction_id: debitResponse.data.data.transaction_id,
                credit_transaction_id: creditResponse.data.data.transaction_id,
                withdrawal_request_transaction_id: withdrawalDebitResponse.data.data.transaction_id,
                roi_payment_endtime_updated: currentTime,
                roi_payment_endtime_updated_formatted: new Date(currentTime * 1000).toLocaleString(),
                note: 'Plan 4 allows instant capital withdrawal to external wallet. ROI accumulation stops at capital withdrawal time.',
                processed_at: currentTime
            }
        });

    } catch (error) {
        console.error('Plan 4 Capital External Withdrawal Error:', error);
        
        // Handle specific error cases
        if (error.response) {
            return res.status(error.response.status).json({
                status: false,
                status_code: error.response.status,
                message: 'Plan 4 Capital External Withdrawal Failed',
                error: {
                    api_error: error.response.data,
                    staking_transaction_id: req.params.stakingTransactionID
                }
            });
        }

        return res.status(400).json({
            status: false,
            status_code: 400,
            message: 'Internal server error during Plan 4 capital external withdrawal',
            error: {
                message: error.message,
                staking_transaction_id: req.params.stakingTransactionID
            }
        });
    }
});

module.exports = router;

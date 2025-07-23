const express = require('express');
const axios = require('axios');
const router = express.Router();

const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

// POST /staking/withdraw-capital/:stakingTransactionID
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

        // Extract required fields
        const staking_capital_locked_duration_ts = parseInt(stakingMeta.staking_capital_locked_duration_ts);
        const staking_capital_payment_wallet_id = stakingMeta.staking_capital_payment_wallet_id;
        const staking_amount = parseFloat(stakingMeta.amount);
        const user_id = stakingMeta.user_id;
        const staking_locked_wallet_id = stakingMeta.staking_capital_locked_wallet_id || `${staking_capital_payment_wallet_id}_staking_locked`;

        // Check if capital lock duration is due
        const now = Math.floor(Date.now() / 1000);
        // Helper to format remaining seconds as human-readable string
        function formatRemainingTime(seconds) {
            if (seconds <= 0) return 'Expired';
            const days = Math.floor(seconds / 86400);
            seconds %= 86400;
            const hours = Math.floor(seconds / 3600);
            seconds %= 3600;
            const minutes = Math.floor(seconds / 60);
            seconds = Math.floor(seconds % 60);
            let parts = [];
            if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
            if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
            if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
            if (seconds > 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
            return parts.length > 0 ? parts.join(', ') : '0 seconds';
        }
        if (now < staking_capital_locked_duration_ts) {
            const remainingSeconds = staking_capital_locked_duration_ts - now;
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'Capital lock period not yet completed',
                details: {
                    staking_transaction_id : stakingTransactionID,
                    staking_capital_locked_duration_ts,
                    current_timestamp: now,
                    remaining_time_seconds: remainingSeconds,
                    remaining_time_formatted: formatRemainingTime(remainingSeconds)
                }
            });
        }

        // Check if capital has already been withdrawn
        if (stakingMeta.staking_capital_withdrawn && stakingMeta.staking_capital_withdrawn.toString().toLowerCase() === 'yes') {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'Capital has already been withdrawn for this staking transaction',
                details: {
                    staking_transaction_id: stakingTransactionID,
                    staking_capital_withdrawn: stakingMeta.staking_capital_withdrawn,
                    staking_capital_withdrawn_at: stakingMeta.staking_capital_withdrawn_at,
                    staking_capital_withdraw_debit_transaction_id: stakingMeta.staking_capital_withdraw_debit_transaction_id,
                    staking_capital_withdraw_credit_transaction_id: stakingMeta.staking_capital_withdraw_credit_transaction_id
                }
            });
        }

        // Step 1: Debit the locked staking wallet
        const debitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
        const debitRequestBody = {
            request_id: `staking_capital_withdraw_request_${request_id}`,
            user_id: user_id,
            amount: staking_amount,
            wallet_id: staking_locked_wallet_id,
            note: 'Staking Capital Withdrawal Request',
            meta_data: {
                staking_transaction_id: stakingTransactionID,
                transaction_action_type: 'staking_capital_withdrawal_debit',
                transaction_type_category: 'staking',
                transaction_external_processor: 'middleware1',
                transaction_approval_status: 'user_middleware_processed',
                transaction_approval_method: 'middleware'
            }
        };
        let debitResponse;
        try {
            debitResponse = await axios.post(debitUrl, debitRequestBody, {
                headers: {
                    'x-api-key': MODULE1_STAKING_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}`
                }
            });
        } catch (debitError) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'Failed to debit locked staking wallet',
                error: debitError.response?.data || debitError
            });
        }

        // Step 2: Credit the main wallet
        const creditUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`;
        const creditRequestBody = {
            request_id: `staking_capital_withdraw_complete_${request_id}`,
            user_id: user_id,
            amount: staking_amount,
            wallet_id: staking_capital_payment_wallet_id,
            note: 'Staking Capital Withdrawal Completed',
            meta_data: {
                staking_transaction_id: stakingTransactionID,
                transaction_action_type: 'staking_capital_withdrawal_credit',
                transaction_type_category: 'staking',
                transaction_external_processor: 'middleware1',
                transaction_approval_status: 'user_middleware_processed',
                transaction_approval_method: 'middleware',
                debit_transaction_id: debitResponse.data?.data?.transaction_id
            }
        };
        let creditResponse;
        try {
            creditResponse = await axios.post(creditUrl, creditRequestBody, {
                headers: {
                    'x-api-key': MODULE1_STAKING_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}`
                }
            });
        } catch (creditError) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'Failed to credit main wallet',
                error: creditError.response?.data || creditError
            });
        }

        // Step 3: Update staking meta to reflect capital withdrawn and record transaction IDs
        const debitTxnId = debitResponse.data?.data?.transaction_id;
        const creditTxnId = creditResponse.data?.data?.transaction_id;
        const updateMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
        const updateMetaBody = {
            staking_capital_withdrawn: 'yes',
            staking_capital_withdrawn_at: Math.floor(Date.now() / 1000),
            staking_capital_withdraw_debit_transaction_id: debitTxnId,
            staking_capital_withdraw_credit_transaction_id: creditTxnId
        };
        let updateMetaResponse;
        try {
            updateMetaResponse = await axios.put(updateMetaUrl, updateMetaBody, {
                headers: {
                    'x-api-key': MODULE1_STAKING_API_KEY
                }
            });
            updateMetaResponse = updateMetaResponse.data;
        } catch (metaError) {
            updateMetaResponse = {
                message: metaError.message,
                data: metaError.response?.data
            };
        }

        // Success response
        return res.json({
            status: true,
            status_code: 200,
            message: 'Capital withdrawal successful',
            details: {
                stakingTransactionID,
                user_id,
                debited_wallet_id: staking_locked_wallet_id,
                credited_wallet_id: staking_capital_payment_wallet_id,
                amount: staking_amount,
                debit_transaction: debitResponse.data,
                credit_transaction: creditResponse.data,
                update_meta: updateMetaResponse,
                processed_at: now
            }
        });
    } catch (error) {
        let error_info;
        if (error.response && error.response.data) {
            error_info = error.response.data;
        } else {
            error_info = error;
        }
        return res.status(400).json({
            status: false,
            status_code: 400,
            message: error.message || 'Internal Error',
            error: error_info
        });
    }
});

module.exports = router; 
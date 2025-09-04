const express = require('express');
const axios = require('axios');
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

// POST /staking/withdraw-staking-capital/plan-2/:stakingTransactionID
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

        // Validate that this is a Plan 2 staking
        if (stakingMeta.staking_plan_id !== 'plan_2') {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'This endpoint is only for Plan 2 staking transactions',
                error: {
                    staking_plan_id: stakingMeta.staking_plan_id,
                    required_plan: 'plan_2'
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
                message: 'Capital has already been withdrawn for this Plan 2 staking transaction',
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
        
        // Check if capital can be withdrawn (Plan 2 has extended lock duration)
        if (!capitalMetrics.can_withdraw_capital) {
            const remainingSeconds = capitalMetrics.capital_locked_duration_ts - capitalMetrics.current_timestamp;
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'Plan 2 Capital lock period not yet completed',
                details: {
                    staking_parent_transaction_id: stakingTransactionID,
                    staking_plan_id: stakingMeta.staking_plan_id,
                    staking_plan_name: stakingMeta.staking_plan_name,
                    staking_capital_locked_duration_ts: capitalMetrics.capital_locked_duration_ts,
                    current_timestamp: capitalMetrics.current_timestamp,
                    current_time_formatted: new Date(capitalMetrics.current_timestamp * 1000).toLocaleString(),
                    capital_withdrawal_time_formatted: new Date(capitalMetrics.capital_locked_duration_ts * 1000).toLocaleString(),
                    remaining_time_seconds: remainingSeconds,
                    remaining_time_formatted: formatRemainingTime(remainingSeconds),
                    note: 'Plan 2 requires extended capital lock duration to be completed before withdrawal'
                }
            });
        }

        // Step 1: Debit the locked staking wallet
        const debitUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/debits`;
        const debitRequestBody = {
            request_id: `plan2_staking_capital_withdraw_request_${request_id}`,
            user_id: user_id,
            amount: staking_amount,
            wallet_id: staking_locked_wallet_id,
            note: 'Plan 2 Staking Capital Withdrawal Request - Long-Term Growth Staking',
            meta_data: {
                staking_transaction_id: stakingTransactionID,
                staking_plan_id: stakingMeta.staking_plan_id,
                staking_plan_name: stakingMeta.staking_plan_name,
                transaction_action_type: 'plan2_staking_capital_withdrawal_debit',
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
            request_id: `plan2_staking_capital_withdraw_credit_${request_id}`,
            user_id: user_id,
            amount: staking_amount,
            wallet_id: staking_capital_payment_wallet_id,
            note: 'Plan 2 Staking Capital Withdrawal Credit - Long-Term Growth Staking',
            meta_data: {
                staking_transaction_id: stakingTransactionID,
                staking_alt_transaction_id: debitResponse.data.data.transaction_id,
                staking_plan_id: stakingMeta.staking_plan_id,
                staking_plan_name: stakingMeta.staking_plan_name,
                transaction_action_type: 'plan2_staking_capital_withdrawal_credit',
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
        
        // For Plan 2, keep original ROI end time (no early termination)
        const updateMetaRequestBody = {
            staking_capital_withdrawn: 'yes',
            staking_capital_withdrawn_at: currentTime,
            staking_capital_withdraw_debit_transaction_id: debitResponse.data.data.transaction_id,
            staking_capital_withdraw_credit_transaction_id: creditResponse.data.data.transaction_id
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
            message: 'Plan 2 Staking Capital Withdrawal Completed Successfully',
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
                roi_payment_endtime_unchanged: stakingMeta.staking_roi_payment_endtime_ts,
                note: 'Plan 2 maintains original ROI end time. ROI continues accumulating until contract end.',
                processed_at: currentTime
            }
        });

    } catch (error) {
        console.error('Plan 2 Capital Withdrawal Error:', error);
        
        // Handle specific error cases
        if (error.response) {
            return res.status(error.response.status).json({
                status: false,
                status_code: error.response.status,
                message: 'Plan 2 Capital Withdrawal Failed',
                error: {
                    api_error: error.response.data,
                    staking_transaction_id: req.params.stakingTransactionID
                }
            });
        }

        return res.status(500).json({
            status: false,
            status_code: 500,
            message: 'Internal server error during Plan 2 capital withdrawal',
            error: {
                message: error.message,
                staking_transaction_id: req.params.stakingTransactionID
            }
        });
    }
});

module.exports = router; 
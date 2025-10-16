const express = require('express');
const axios = require('axios');
const router = express.Router();
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');

const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

// Import staking utils calculators
const {
    calculateStakingROIMetricsFromMetaData,
    calculateStakingROIMetricsFromMetaDataPattern2,
    calculateStakingMetricsFromMetaData,
    calculateStakingMetricsFromMetaDataPattern2
} = require('./utils');


router.get('/:walletID', async function(req, res, next) {
    try {
        const wallet_id = req.params.walletID;
        const wallet_id_locked = `${wallet_id}_staking_locked`;

        const user_id = parseInt(req.query.user_id) || 0;

        // Check if Authorization is added
        if (!req.headers.authorization) {
            const response = {
                status: false,
                status_code: 400,
                message: 'JWT Token required',
                error: { error_data: req.headers.authorization }
            };
            return res.status(400).send(response); // Return response if not added
        }
        
        // Extract JWT Bearer token from the request headers and remove the Bearer keyword
        const userBearerJWToken = req.headers.authorization.split(' ')[1];

        // Call the first endpoint to retrieve staking by user
        const getUserStakingUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v3/transactions?user_id=${user_id}&meta_key=currency&meta_value=${wallet_id_locked}&order=DESC&pageno=1&per_page=100&metas_to_retrieve=_ALL&transaction_owner_user_metas_to_retrieve=_current_user_balance,_user_email,eth_crypto_wallet_deposit_address,phone_number,rimplenet_referrer_sponsor`;
        const getUserStakingResponse = await axios.get(getUserStakingUrl, {
            headers: {
                'Authorization': `Bearer ${userBearerJWToken}`,
                'x-api-key': MODULE1_STAKING_API_KEY,
            }
        });

        const stakingTransactions = getUserStakingResponse.data.data;

        // Initialize an array to store results for each transaction
        const maxWithdrawalAmounts = [];

        // Loop through each transaction
        for (const transaction of stakingTransactions) {
            // Use utils-based calculator (handles normal and pattern_2 safely)
            const maxWithdrawalAmount = await calculateMaxFromTransactionViaUtils(transaction);
            maxWithdrawalAmount.staking_transaction_id = transaction.ID;
            maxWithdrawalAmounts.push(maxWithdrawalAmount);
        }

        // Initialize variables to hold the sums
        let total_maximum_staking_accumulated_roi_amount_user_can_withdraw_now = 0;
        let total_staking_accumulated_roi_amount_already_withdrawn_by_user = 0;
        let total_staking_accumulated_roi_amount_earned_till_now = 0;

        // Iterate over the array and sum up the respective properties
        maxWithdrawalAmounts.forEach(item => {
            total_maximum_staking_accumulated_roi_amount_user_can_withdraw_now += item.maximum_staking_accumulated_roi_amount_user_can_withdraw_now;
            total_staking_accumulated_roi_amount_already_withdrawn_by_user += item.staking_accumulated_roi_amount_already_withdrawn_by_user;
            total_staking_accumulated_roi_amount_earned_till_now += item.staking_accumulated_roi_amount_till_now;
        });

        // Create a single data point containing the sums
        total_maximum_staking_accumulated_roi_amount_user_can_withdraw_now = parseFloat(parseFloat(total_maximum_staking_accumulated_roi_amount_user_can_withdraw_now || 0).toFixed(2));
        total_staking_accumulated_roi_amount_already_withdrawn_by_user = parseFloat(parseFloat(total_staking_accumulated_roi_amount_already_withdrawn_by_user || 0).toFixed(2));
        total_staking_accumulated_roi_amount_earned_till_now = parseFloat(parseFloat(total_staking_accumulated_roi_amount_earned_till_now || 0).toFixed(2));

        const summedStakingData = {
            total_maximum_staking_accumulated_roi_amount_user_can_withdraw_now,
            total_staking_accumulated_roi_amount_already_withdrawn_by_user,
            total_staking_accumulated_roi_amount_earned_till_now
        };

        // Response object with staking transactions and maximum withdrawal amounts
        const response = {
            status: true,
            status_code: 200,
            message: "All Staking ROI Interest Data Retrieved",
            data: {
                wallet_id: wallet_id,
                wallet_id_locked: wallet_id_locked,
                all_summed_staking_data: summedStakingData,
                maxWithdrawalAmounts: maxWithdrawalAmounts,
                getUserStakingResponse: getUserStakingResponse.data
            }
        };

        return res.send(response);
    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

// Replace old function with utils-based computation
function calculateMaxFromTransactionViaUtils(stakingMetaResponse) {
    const metas = stakingMetaResponse.metas || {};
    const getMeta = (key) => (metas[key] && metas[key][0] !== undefined ? metas[key][0] : undefined);

    // helpers to coerce numbers safely
    const toNumber = (val, def = 0) => {
        if (val === undefined || val === null || val === '') return def;
        const num = Number(val);
        return isNaN(num) ? def : num;
    };
    const toInt = (val, def = 0) => {
        if (val === undefined || val === null || val === '') return def;
        const num = parseInt(val);
        return isNaN(num) ? def : num;
    };

    // normalize interval to safe default
    const validIntervals = new Set(['every_second','every_minute','every_hour','every_day','every_week','every_month','every_year']);
    const normalizeInterval = (val) => (validIntervals.has((val||'').toString()) ? val : 'every_day');

    // Detect pattern
    const pattern = getMeta('staking_roi_payment_pattern');
    const isPattern2 = pattern === 'internal_pattern_2';

    // Build flat meta object for utils (sanitize numerics)
    let stakingMetaData;
    if (isPattern2) {
        stakingMetaData = {
            staking_amount_internal_pattern_2: toNumber(getMeta('staking_amount_internal_pattern_2')),
            staking_roi_interval_payment_amount_internal_pattern_2: toNumber(getMeta('staking_roi_interval_payment_amount_internal_pattern_2')),
            staking_roi_payment_interval: normalizeInterval(getMeta('staking_roi_payment_interval')),
            staking_roi_payment_startime_ts_internal_pattern_2: toInt(getMeta('staking_roi_payment_startime_ts_internal_pattern_2')),
            staking_roi_payment_endtime_ts_internal_pattern_2: toInt(getMeta('staking_roi_payment_endtime_ts_internal_pattern_2')),
            staking_roi_last_withdrawal_ts_internal_pattern_2: toInt(getMeta('staking_roi_last_withdrawal_ts_internal_pattern_2')) || 0,
            staking_roi_full_payment_amount_at_end_of_contract_internal_pattern_2: toNumber(getMeta('staking_roi_full_payment_amount_at_end_of_contract_internal_pattern_2')),
            staking_roi_amount_withdrawn_so_far_internal_pattern_2: toNumber(getMeta('staking_roi_amount_withdrawn_so_far_internal_pattern_2')) || 0,
            staking_plan_id: getMeta('staking_plan_id'),
            staking_capital_withdrawn_at: toInt(getMeta('staking_capital_withdrawn_at')),
            stop_roi_after_capital_withdrawal: getMeta('stop_roi_after_capital_withdrawal')
        };
    } else {
        stakingMetaData = {
            staking_amount: toNumber(getMeta('staking_amount')),
            staking_roi_interval_payment_amount: toNumber(getMeta('staking_roi_interval_payment_amount')),
            staking_roi_payment_interval: normalizeInterval(getMeta('staking_roi_payment_interval')),
            staking_roi_payment_startime_ts: toInt(getMeta('staking_roi_payment_startime_ts')),
            staking_roi_payment_endtime_ts: toInt(getMeta('staking_roi_payment_endtime_ts')),
            staking_roi_last_withdrawal_ts: toInt(getMeta('staking_roi_last_withdrawal_ts')) || 0,
            staking_roi_full_payment_amount_at_end_of_contract: toNumber(getMeta('staking_roi_full_payment_amount_at_end_of_contract')),
            staking_roi_amount_withdrawn_so_far: toNumber(getMeta('staking_roi_amount_withdrawn_so_far')) || 0,
            staking_plan_id: getMeta('staking_plan_id'),
            staking_capital_withdrawn_at: toInt(getMeta('staking_capital_withdrawn_at')),
            stop_roi_after_capital_withdrawal: getMeta('stop_roi_after_capital_withdrawal')
        };
    }

    // Compute display (earned till now) and withdrawal metrics via utils
    const displayMetrics = isPattern2
        ? calculateStakingMetricsFromMetaDataPattern2(stakingMetaData)
        : calculateStakingMetricsFromMetaData(stakingMetaData);

    const withdrawMetrics = isPattern2
        ? calculateStakingROIMetricsFromMetaDataPattern2(stakingMetaData)
        : calculateStakingROIMetricsFromMetaData(stakingMetaData);

    return {
        maximum_staking_accumulated_roi_amount_user_can_withdraw_now: Number(withdrawMetrics.accumulated_roi_user_can_withdraw_now || 0),
        staking_accumulated_roi_amount_already_withdrawn_by_user: Number(withdrawMetrics.accumulated_roi_user_have_already_withdraw || 0),
        staking_accumulated_roi_amount_till_now: Number(displayMetrics.accumulated_roi_now || 0)
    };
}


module.exports = router;
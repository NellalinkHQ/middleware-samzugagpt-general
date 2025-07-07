const express = require('express');
const axios = require('axios');
const router = express.Router();
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');

const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;


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

        // Dynamically retrieve the base URL
        // const baseURL = `${req.protocol}://${req.get('host')}`;
        const baseURL = `https://middleware-rimplenet-general.samzugagpt.com`;

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
            // Call function to calculate maximum withdrawal amount for each transaction
            const maxWithdrawalAmount = await calculateMaxStakingWithdrawalAmount(transaction);
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


function calculateMaxStakingWithdrawalAmount(stakingMetaResponse) {
    let staking_amount, staking_roi_interval_payment_amount, staking_roi_interval_payment_percentage, staking_roi_payment_wallet_id, accumulated_total_roi_at_end_of_staking_contract, accumulated_total_amount_at_end_of_staking_contract, staking_roi_payment_startime_ts, staking_roi_payment_endtime_ts, staking_last_withdrawal_ts, staking_roi_amount_remaining_to_be_paid, staking_roi_amount_withdrawn_so_far;
    
    const timestamp_interval_values = {
        every_second: { ts: 1, name: "Second", name_repetition: "Every Second" },
        every_minute: { ts: 60, name: "Minute", name_repetition: "Every Minute" },
        every_hour: { ts: 3600, name: "Hour", name_repetition: "Every Hour" },
        every_day: { ts: 86400, name: "Day", name_repetition: "Daily" },
        every_week: { ts: 604800, name: "Week", name_repetition: "Weekly" },
        every_month: { ts: 2592000, name: "Month", name_repetition: "Monthly" },
        every_year: { ts: 31536000, name: "Year", name_repetition: "Yearly" }
    };

    let staking_roi_payment_pattern = stakingMetaResponse.metas.staking_roi_payment_pattern[0];

    if (staking_roi_payment_pattern === "internal_pattern_2") {
        staking_amount = parseFloat(stakingMetaResponse.metas.staking_amount_internal_pattern_2[0]);
        staking_roi_interval_payment_amount = parseFloat(stakingMetaResponse.metas.staking_roi_interval_payment_amount_internal_pattern_2[0]);
        staking_roi_interval_payment_percentage = parseFloat(stakingMetaResponse.metas.staking_roi_interval_payment_percentage_internal_pattern_2[0]);
        staking_roi_payment_wallet_id = stakingMetaResponse.metas.staking_roi_payment_wallet_id_internal_pattern_2[0];
        accumulated_total_roi_at_end_of_staking_contract = parseFloat(stakingMetaResponse.metas.staking_roi_full_payment_amount_at_end_of_contract_internal_pattern_2[0]);
        accumulated_total_amount_at_end_of_staking_contract = staking_amount + accumulated_total_roi_at_end_of_staking_contract;

        staking_roi_payment_startime_ts = parseInt(stakingMetaResponse.metas.staking_roi_payment_startime_ts_internal_pattern_2[0]);
        staking_roi_payment_endtime_ts = parseInt(stakingMetaResponse.metas.staking_roi_payment_endtime_ts_internal_pattern_2[0]);
        staking_last_withdrawal_ts = parseInt(stakingMetaResponse.metas.staking_roi_last_withdrawal_ts_internal_pattern_2[0]);

        staking_roi_amount_remaining_to_be_paid = parseFloat(stakingMetaResponse.metas.staking_roi_amount_remaining_to_be_paid_internal_pattern_2[0]);
        staking_roi_amount_withdrawn_so_far = parseFloat(stakingMetaResponse.metas.staking_roi_amount_withdrawn_so_far_internal_pattern_2[0]);
    } else {
        staking_amount = parseFloat(stakingMetaResponse.metas.staking_amount[0]);
        staking_roi_interval_payment_amount = parseFloat(stakingMetaResponse.metas.staking_roi_interval_payment_amount[0]);
        staking_roi_interval_payment_percentage = parseFloat(stakingMetaResponse.metas.staking_roi_interval_payment_percentage[0]);
        staking_roi_payment_wallet_id = stakingMetaResponse.metas.staking_roi_payment_wallet_id[0];
        accumulated_total_roi_at_end_of_staking_contract = parseFloat(stakingMetaResponse.metas.staking_roi_full_payment_amount_at_end_of_contract[0]);
        accumulated_total_amount_at_end_of_staking_contract = staking_amount + accumulated_total_roi_at_end_of_staking_contract;

        staking_roi_payment_startime_ts = parseInt(stakingMetaResponse.metas.staking_roi_payment_startime_ts[0]);
        staking_roi_payment_endtime_ts = parseInt(stakingMetaResponse.metas.staking_roi_payment_endtime_ts[0]);
        staking_last_withdrawal_ts = parseInt(stakingMetaResponse.metas.staking_roi_last_withdrawal_ts[0]);

        staking_roi_amount_remaining_to_be_paid = parseFloat(stakingMetaResponse.metas.staking_roi_amount_remaining_to_be_paid[0]);
        staking_roi_amount_withdrawn_so_far = parseFloat(stakingMetaResponse.metas.staking_roi_amount_withdrawn_so_far[0]);
    }

    const staking_roi_accumulate_datetime_now_ts = Math.floor(Date.now() / 1000); // Converted to seconds
    const count_number_of_staking_payment_interval_from_startime_till_now = Math.floor((staking_roi_accumulate_datetime_now_ts - staking_roi_payment_startime_ts) / timestamp_interval_values[stakingMetaResponse.metas.staking_roi_payment_interval[0]].ts);
    const accumulatedROINow = count_number_of_staking_payment_interval_from_startime_till_now * staking_roi_interval_payment_amount;

    let maximum_amount_user_can_withdraw_now = (count_number_of_staking_payment_interval_from_startime_till_now * staking_roi_interval_payment_amount) - parseFloat(staking_roi_amount_withdrawn_so_far);

    // let accumulated_roi_user_can_withdraw_now;
    // let accumulated_roi_user_have_already_withdraw;
    // if (staking_last_withdrawal_ts === 0) {
    //     accumulated_roi_user_can_withdraw_now = accumulatedROINow;
    //     accumulated_roi_user_have_already_withdraw = 0;
    // } else {
    //     const count_number_of_staking_payment_interval_from_last_user_withdrawal_till_now = Math.floor((staking_roi_accumulate_datetime_now_ts - staking_last_withdrawal_ts) / timestamp_interval_values[stakingMetaResponse.metas.staking_roi_payment_interval[0]].ts);
    //     accumulated_roi_user_can_withdraw_now = count_number_of_staking_payment_interval_from_last_user_withdrawal_till_now * staking_roi_interval_payment_amount;
    //     accumulated_roi_user_have_already_withdraw = accumulatedROINow - accumulated_roi_user_can_withdraw_now;
    // }

    return {
        "maximum_staking_accumulated_roi_amount_user_can_withdraw_now": maximum_amount_user_can_withdraw_now,
        "staking_accumulated_roi_amount_already_withdrawn_by_user": staking_roi_amount_withdrawn_so_far,
        "staking_accumulated_roi_amount_till_now": accumulatedROINow,
    };
}


module.exports = router;
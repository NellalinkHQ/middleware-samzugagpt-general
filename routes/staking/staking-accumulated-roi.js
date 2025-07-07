var express = require('express');
const axios = require('axios');
var router = express.Router();

const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

/* Accumulated Staking ROI */
router.get('/:stakingTransactionID', async function(req, res, next) {
    try {
        
    const stakingTransactionID = req.params.stakingTransactionID;

    const timestamp_interval_values = {
      every_second: { ts: 1, name: "Second", name_repetition: "Every Second" },
      every_minute: { ts: 60, name: "Minute", name_repetition: "Every Minute" },
      every_hour: { ts: 3600, name: "Hour", name_repetition: "Every Hour" },
      every_day: { ts: 86400, name: "Day", name_repetition: "Daily" },
      every_week: { ts: 604800, name: "Week", name_repetition: "Weekly" },
      every_month: { ts: 2592000, name: "Month", name_repetition: "Monthly" },
      every_year: { ts: 31536000, name: "Year", name_repetition: "Yearly" }
    };

    const userBearerJWToken = req.headers.authorization.split(' ')[1];

    const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
    const stakingMetaResponse = await axios.get(stakingMetaUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
            }
        });

    
    const staking_amount = parseFloat(stakingMetaResponse.data.data.staking_amount);
    const staking_roi_interval_payment_amount = parseFloat(stakingMetaResponse.data.data.staking_roi_interval_payment_amount);
    const staking_roi_interval_payment_percentage = parseFloat(stakingMetaResponse.data.data.staking_roi_interval_payment_percentage);
    const staking_roi_payment_interval = stakingMetaResponse.data.data.staking_roi_payment_interval;
    const accumulated_total_roi_at_end_of_staking_contract  = parseFloat(stakingMetaResponse.data.data.staking_roi_full_payment_amount_at_end_of_contract);
    const accumulated_total_amount_at_end_of_staking_contract  = staking_amount + accumulated_total_roi_at_end_of_staking_contract;
    
    const staking_roi_payment_startime_ts = parseInt(stakingMetaResponse.data.data.staking_roi_payment_startime_ts);
    const staking_roi_payment_endtime_ts = parseInt(stakingMetaResponse.data.data.staking_roi_payment_endtime_ts);
    const staking_last_withdrawal_ts = parseInt(stakingMetaResponse.data.data.staking_roi_last_withdrawal_ts);
    const staking_roi_accumulate_datetime_now_ts = Math.floor(Date.now() / 1000); // Converted to seconds
    const datetime = new Date(staking_roi_accumulate_datetime_now_ts * 1000); // Converted to milliseconds for Date constructor
    const formattedDateTime = datetime.toLocaleString();

    // Function to calculate accumulated ROI
    const count_number_of_staking_payment_interval_from_startime_till_now = Math.floor((staking_roi_accumulate_datetime_now_ts - staking_roi_payment_startime_ts) / timestamp_interval_values[staking_roi_payment_interval].ts);
    let accumulatedROINow = count_number_of_staking_payment_interval_from_startime_till_now * staking_roi_interval_payment_amount;


    // Calculate accumulated ROI user can withdraw
    let accumulated_roi_user_can_withdraw_now;
    let accumulated_roi_user_have_already_withdraw;
    if (staking_last_withdrawal_ts == 0) {
        accumulated_roi_user_can_withdraw_now = accumulatedROINow;
        accumulated_roi_user_have_already_withdraw = 0;
    } else {
        const count_number_of_staking_payment_interval_from_last_user_withdrawal_till_now = Math.floor((staking_roi_accumulate_datetime_now_ts - staking_last_withdrawal_ts) / timestamp_interval_values[staking_roi_payment_interval].ts);
        accumulated_roi_user_can_withdraw_now = count_number_of_staking_payment_interval_from_last_user_withdrawal_till_now * staking_roi_interval_payment_amount;
        accumulated_roi_user_have_already_withdraw = accumulatedROINow - accumulated_roi_user_can_withdraw_now;
    }


    // Calculate accumulated amount based on ROI
    let accumulatedTotalAmountNow = staking_amount + accumulatedROINow;

    // Update response data
    let response = {
        status: true,
        status_code: 200,
        message: "Staking ROI Interest Accumulated Retrieved",
        data: {
            checks: count_number_of_staking_payment_interval_from_startime_till_now,
            accumulated_roi_user_can_withdraw_now: accumulated_roi_user_can_withdraw_now,
            accumulated_roi_user_have_already_withdraw: accumulated_roi_user_have_already_withdraw,
            accumulated_roi_now: accumulatedROINow,
            accumulated_total_amount_now: accumulatedTotalAmountNow,
            accumulated_total_roi_at_end_of_staking_contract: accumulated_total_roi_at_end_of_staking_contract,
            accumulated_total_amount_at_end_of_staking_contract: accumulated_total_amount_at_end_of_staking_contract,
            accumulated_timestamp_retrieved_at: staking_roi_accumulate_datetime_now_ts,
            accumulated_datetime_retrieved_at: formattedDateTime
        }
    };

    console.log(response);

    //Display the response
    res.send(response);
    
    } catch (error) {

        let error_info;
        if (error.response && error.response.data) {
            error_info = error.response.data;
        } else {
            error_info = error;
        }

        const response = {
            status: false,
            status_code: 400,
            message: error.message || "Internal Error",
            error: error_info
        };


        console.error('Error:', error_info);
        res.status(400).send(response);
    }
});

module.exports = router;

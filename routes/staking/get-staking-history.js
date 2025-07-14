var express = require('express');
const axios = require('axios');
var router = express.Router();

const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

/* GET Staking Interest */
router.get('/old/:stakingTransactionID',async function(req, res, next) {

    try {
    const stakingTransactionID = req.params.stakingTransactionID;

    // Parse query parameters from the URL
    let user_id = parseInt(req.query.user_id) || 0;
    let staking_roi_per_page = parseInt(req.query.per_page) || 2;
    let staking_roi_page_no = parseInt(req.query.page_no) || 1;
    let staking_roi_interval_provided_datetime_ts = parseInt(req.query.count_for_provided_datetime_ts) || Math.floor(Date.now() / 1000);
    let staking_roi_order = req.query.order || "DESC";

    const timestamp_interval_values = {
      every_second: { ts: 1, name: "Second", name_repetition: "Every Second" },
      every_minute: { ts: 60, name: "Minute", name_repetition: "Every Minute" },
      every_hour: { ts: 3600, name: "Hour", name_repetition: "Every Hour" },
      every_day: { ts: 86400, name: "Day", name_repetition: "Daily" },
      every_week: { ts: 604800, name: "Week", name_repetition: "Weekly" },
      every_month: { ts: 2592000, name: "Month", name_repetition: "Monthly" },
      every_year: { ts: 31536000, name: "Year", name_repetition: "Yearly" }
    };


    const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
    const stakingMetaResponse = await axios.get(stakingMetaUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY
            }
        });
    
    //For testing start here
    // let staking_amount = 100;
    // let staking_datetime_ago = 1708383600;
    // let staking_roi_interval_payment_amount = 2;
    // let staking_roi_interval_payment_percentage = "1%";
    // let staking_roi_payment_interval = 'every_day';

    // let staking_roi_payment_startime_ts = 1708383600; // Converted to seconds
    // let staking_roi_payment_endtime_ts = 1709074800; // Converted to seconds
    // let staking_roi_interval_provided_datetime_ts = 1708988400; // Converted to seconds
    //For testing ends here
    let staking_roi_payment_pattern = stakingMetaResponse.data.data.staking_roi_payment_pattern;

    let staking_amount = parseFloat(stakingMetaResponse.data.data.staking_amount);
    

    let staking_roi_interval_payment_amount = parseFloat(stakingMetaResponse.data.data.staking_roi_interval_payment_amount);
    let staking_roi_accumulation_wallet_id = stakingMetaResponse.data.data.staking_roi_payment_wallet_id;
    let staking_roi_accumulation_amount_formatted = staking_roi_accumulation_wallet_id+" "+staking_roi_interval_payment_amount;
    const accumulated_total_roi_at_end_of_staking_contract  = parseFloat(stakingMetaResponse.data.data.staking_roi_full_payment_amount_at_end_of_contract);
    const accumulated_total_amount_at_end_of_staking_contract  = staking_amount + accumulated_total_roi_at_end_of_staking_contract;
    
    let staking_roi_interval_payment_percentage = parseFloat(stakingMetaResponse.data.data.staking_roi_interval_payment_percentage);
    let staking_roi_payment_interval = stakingMetaResponse.data.data.staking_roi_payment_interval;
    let staking_roi_payment_startime_ts = parseInt(stakingMetaResponse.data.data.staking_roi_payment_startime_ts);
    let staking_roi_payment_endtime_ts = parseInt(stakingMetaResponse.data.data.staking_roi_payment_endtime_ts);
    

    let staking_roi_accumulate_datetime_now_ts = Math.floor(Date.now() / 1000); // Converted to seconds
    const datetime = new Date(staking_roi_accumulate_datetime_now_ts * 1000); // Converted to milliseconds for Date constructor
    const formattedDateTime = datetime.toLocaleString();
    const count_number_of_staking_payment_interval_from_startime_till_now = Math.floor((staking_roi_accumulate_datetime_now_ts - staking_roi_payment_startime_ts) / timestamp_interval_values[staking_roi_payment_interval].ts);
    const count_number_of_staking_payment_interval_from_startime_till_provided_datetime = Math.floor((staking_roi_interval_provided_datetime_ts - staking_roi_payment_startime_ts) / timestamp_interval_values[staking_roi_payment_interval].ts);
    const count_number_of_staking_payment_interval_from_startime_till_endtime = Math.floor((staking_roi_payment_endtime_ts - staking_roi_payment_startime_ts) / timestamp_interval_values[staking_roi_payment_interval].ts);
    const staking_last_withdrawal_ts = parseInt(stakingMetaResponse.data.data.staking_roi_last_withdrawal_ts);
    


    if(staking_roi_interval_provided_datetime_ts<staking_roi_payment_startime_ts){
        const response = {
            status: false,
            status_code: 400,
            message: "Provided datetime is before the staking start time",
            error: {error_data:staking_roi_interval_provided_datetime_ts}
        };
        return res.status(400).send(response);
    }
    // Function to calculate accumulated ROI
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

    let roi_interest_data = [];

    // Calculate the starting timestamp for the current page
    let initial_added_ts = ((staking_roi_page_no - 1) * staking_roi_per_page * timestamp_interval_values[staking_roi_payment_interval].ts) + timestamp_interval_values[staking_roi_payment_interval].ts;

    let staking_roi_history_payment_datetime_ts = staking_roi_payment_startime_ts + initial_added_ts; // Initialize with staking_roi_payment_startime_ts
    
    //check if pagination is more than data
    if(staking_roi_per_page>=count_number_of_staking_payment_interval_from_startime_till_endtime){
            staking_roi_per_page = count_number_of_staking_payment_interval_from_startime_till_endtime;
    }

    // Populate roi_interest_data array based on the staking_roi_order
    for (let i = 1; i <= staking_roi_per_page; i++) {
         if(staking_roi_history_payment_datetime_ts>staking_roi_accumulate_datetime_now_ts){ break; }// Ends when current time is reached
    
        // Format the staking ROI accumulation datetime
        const staking_roi_accumulation_formatted_datetime = new Date(staking_roi_history_payment_datetime_ts * 1000).toLocaleString();
        
        let interval_count = (staking_roi_page_no - 1) * staking_roi_per_page + i;
        let paid_at_count ;
        if(staking_roi_order=="ASC"){
            paid_at_count = interval_count;
        }
        else{
            paid_at_count =  Math.abs(interval_count-staking_roi_per_page) + 1;
        }
        


        let interest_info = {
            staking_roi_accumulation_id: interval_count,
            staking_roi_accumulation_interval: staking_roi_payment_interval,
            staking_roi_accumulation_wallet_id: staking_roi_accumulation_wallet_id,
            staking_roi_accumulation_amount: staking_roi_interval_payment_amount,
            staking_roi_accumulation_amount_formatted: staking_roi_accumulation_amount_formatted,
            staking_roi_accumulation_interval_paid_at: timestamp_interval_values[staking_roi_payment_interval].name+ " " + paid_at_count, // Increment the interval counter
            staking_roi_accumulation_datetime_ts: staking_roi_history_payment_datetime_ts,
            staking_roi_accumulation_formatted_datetime: staking_roi_accumulation_formatted_datetime,
        };
         if(staking_roi_payment_pattern==="internal_pattern_2"){
            let staking_roi_accumulation_wallet_id_internal_pattern_2 = stakingMetaResponse.data.data.staking_roi_payment_wallet_id_internal_pattern_2;
            let staking_roi_accumulation_amount_formatted_staking_amount_internal_pattern_2 = staking_roi_accumulation_wallet_id_internal_pattern_2+" "+ parseFloat(stakingMetaResponse.data.data.staking_roi_interval_payment_amount_internal_pattern_2);
    
            interest_info.staking_roi_accumulation_wallet_id_internal_pattern_2 = staking_roi_accumulation_wallet_id_internal_pattern_2;
            interest_info.staking_roi_accumulation_amount_internal_pattern_2 = parseFloat(stakingMetaResponse.data.data.staking_roi_interval_payment_amount_internal_pattern_2);
            interest_info.staking_roi_accumulation_amount_formatted_internal_pattern_2 = staking_roi_accumulation_amount_formatted_staking_amount_internal_pattern_2;
                
        }

        roi_interest_data.push(interest_info);

        // Increment staking_roi_history_payment_datetime_ts by the payment interval
        staking_roi_history_payment_datetime_ts += timestamp_interval_values[staking_roi_payment_interval].ts;

      }



    let response = {
        status: true,
        status_code: 200,
        message: "Staking ROI Interest Retrieved",
        staking_roi_payment_pattern: staking_roi_payment_pattern,
        count_number_of_staking_payment_interval_from_startime_till_now: count_number_of_staking_payment_interval_from_startime_till_now,
        count_number_of_staking_payment_interval_from_startime_till_provided_datetime: count_number_of_staking_payment_interval_from_startime_till_provided_datetime,
        count_number_of_staking_payment_interval_from_startime_till_endtime: count_number_of_staking_payment_interval_from_startime_till_endtime,


        checks: count_number_of_staking_payment_interval_from_startime_till_now,
        accumulated_roi_user_can_withdraw_now: accumulated_roi_user_can_withdraw_now,
        accumulated_roi_user_have_already_withdraw: accumulated_roi_user_have_already_withdraw,
        accumulated_roi_now: accumulatedROINow,
        accumulated_total_amount_now: accumulatedTotalAmountNow,
        accumulated_total_roi_at_end_of_staking_contract: accumulated_total_roi_at_end_of_staking_contract,
        accumulated_total_amount_at_end_of_staking_contract: accumulated_total_amount_at_end_of_staking_contract,
        accumulated_timestamp_retrieved_at: staking_roi_accumulate_datetime_now_ts,
        accumulated_datetime_retrieved_at: formattedDateTime,

        data: roi_interest_data
    };

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

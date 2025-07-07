var express = require('express');
const axios = require('axios');
var router = express.Router();

const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');

const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

/* Withdraw Staking ROI */
router.post('/:stakingTransactionID', async function(req, res, next) {
    try {
    
    // Extracting stakingTransactionID from the url req params
    const stakingTransactionID = req.params.stakingTransactionID;

    // Extracting request_id, user_id, and amount_to_withdraw from the request body
    const { request_id, user_id, amount_to_withdraw } = req.body;   

    /// Check if Authorization is added
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


    const timestamp_interval_values = {
      every_second: { ts: 1, name: "Second", name_repetition: "Every Second" },
      every_minute: { ts: 60, name: "Minute", name_repetition: "Every Minute" },
      every_hour: { ts: 3600, name: "Hour", name_repetition: "Every Hour" },
      every_day: { ts: 86400, name: "Day", name_repetition: "Daily" },
      every_week: { ts: 604800, name: "Week", name_repetition: "Weekly" },
      every_month: { ts: 2592000, name: "Month", name_repetition: "Monthly" },
      every_year: { ts: 31536000, name: "Year", name_repetition: "Yearly" }
    };
    //set request_id format
    let roi_credit_request_id = `staking_roi_interest_payment_${request_id}`;

    // let proceed_to_staking_withdrawal = false;
    // try {
    //     checkWithdrawalRequestExistUrl = `https://backend.samzugagpt.com/wp-json/nellalink/v2/smart-meta-manager/content/utils/check-if-meta-value-exists?meta_key=request_id&meta_value=${roi_credit_request_id}`;
    //     const stakingTransactionExistsReponse = await axios.get(checkWithdrawalRequestExistUrl, {
    //         headers: {
    //             'x-api-key': MODULE1_STAKING_BASE_URL
    //         }
    //     });
    //     // Check the response status
    //     if (stakingTransactionExistsReponse.status === 200) {
            
    //         const response = {
    //             status: false,
    //             status_code: 400,
    //             message: `Staking Withdrawal Request Already Exists`,
    //             error: {}
    //         };

    //         return res.status(400).send(response);
            
    //     } else {

    //         const response = {
    //             status: false,
    //             status_code: 400,
    //             message: `Unexpected response status`,
    //             error: stakingTransactionExistsReponse.data
    //         };
            
    //         return res.status(400).send(response);
            
    //     }

    // } catch (error) {
    //     // In this case 404 means withdrawal did not exists and was caught in error block 
    //     if (error.response && error.response.status === 404) {
    //         // Proceed with staking withdrawal if the withdrawal request does not exist
    //         proceed_to_staking_withdrawal = true;

    //     }
    //     else{
    //     console.error('Error in stakingTransactionExistsReponse request:', error);
    //     }
    // }

    // if(proceed_to_staking_withdrawal!=true){

    //     const response = {
    //         status: false,
    //         status_code: 400,
    //         message: `Cannot proceed to execution due to unknown issue`,
    //         error: {}
    //     };
        
    //     return res.status(400).send(response);

    // }



    const stakingMetaUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${stakingTransactionID}`;
    const stakingMetaResponse = await axios.get(stakingMetaUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
            }
        });

    
    const staking_withdrawal_exists = stakingMetaResponse.data.data[`staking_roi_payment_request_${request_id}`];
    if(staking_withdrawal_exists){

        const response = {
            status: false,
            status_code: 400,
            message: `Withdrawal detected to already exists at transaction - (#${staking_withdrawal_exists})`,
            error: {}
        };
        
        return res.status(400).send(response);

    }

    //Valid Amount check
    if (
    typeof amount_to_withdraw !== "string" || // Ensure it's a string
    isNaN(amount_to_withdraw) ||             // Ensure the string can be parsed into a number
    parseFloat(amount_to_withdraw) <= 0 ||   // Ensure the number is greater than 0
    !/^\d+(\.\d+)?$/.test(amount_to_withdraw.trim()) // Validate numeric format (no spaces, valid decimals)
    ) {
        const response = {
            status: false,
            status_code: 400,
            message: "Invalid Withdrawal Amount",
            error: {
                message: "Invalid or non-numeric withdrawal amount provided",
                recommendation: "Provide a valid numeric amount as a string (e.g., '0.1', '1', '0.001'). Spaces or invalid characters are not allowed.",
                error_data: amount_to_withdraw
            }
        };
        return res.status(400).send(response);
    }

    // Parse the valid string to a number for further processing
    //amount_to_withdraw = parseFloat(amount_to_withdraw);



    const staking_roi_payment_pattern = stakingMetaResponse.data.data.staking_roi_payment_pattern;
    const staking_roi_payment_interval = stakingMetaResponse.data.data.staking_roi_payment_interval;
    let staking_roi_payment_wallet_id;
    if (staking_roi_payment_pattern=="internal_pattern_2") {

        staking_amount = parseFloat(stakingMetaResponse.data.data.staking_amount_internal_pattern_2);
        staking_roi_interval_payment_amount = parseFloat(stakingMetaResponse.data.data.staking_roi_interval_payment_amount_internal_pattern_2);
        staking_roi_interval_payment_percentage = parseFloat(stakingMetaResponse.data.data.staking_roi_interval_payment_percentage_internal_pattern_2);
        staking_roi_payment_wallet_id = stakingMetaResponse.data.data.staking_roi_payment_wallet_id_internal_pattern_2;
        accumulated_total_roi_at_end_of_staking_contract  = parseFloat(stakingMetaResponse.data.data.staking_roi_full_payment_amount_at_end_of_contract_internal_pattern_2);
        accumulated_total_amount_at_end_of_staking_contract  = staking_amount + accumulated_total_roi_at_end_of_staking_contract;

        staking_roi_payment_startime_ts = parseInt(stakingMetaResponse.data.data.staking_roi_payment_startime_ts_internal_pattern_2);
        staking_roi_payment_endtime_ts = parseInt(stakingMetaResponse.data.data.staking_roi_payment_endtime_ts_internal_pattern_2);
        staking_last_withdrawal_ts = parseInt(stakingMetaResponse.data.data.staking_roi_last_withdrawal_ts_internal_pattern_2);


        staking_roi_amount_remaining_to_be_paid = parseFloat(stakingMetaResponse.data.data.staking_roi_amount_remaining_to_be_paid_internal_pattern_2);
        staking_roi_amount_withdrawn_so_far = parseFloat(stakingMetaResponse.data.data.staking_roi_amount_withdrawn_so_far_internal_pattern_2);
       
    }
    else{

        staking_amount = parseFloat(stakingMetaResponse.data.data.staking_amount);
        staking_roi_interval_payment_amount = parseFloat(stakingMetaResponse.data.data.staking_roi_interval_payment_amount);
        staking_roi_interval_payment_percentage = parseFloat(stakingMetaResponse.data.data.staking_roi_interval_payment_percentage);
        staking_roi_payment_wallet_id = stakingMetaResponse.data.data.staking_roi_payment_wallet_id;
        accumulated_total_roi_at_end_of_staking_contract  = parseFloat(stakingMetaResponse.data.data.staking_roi_full_payment_amount_at_end_of_contract);
        accumulated_total_amount_at_end_of_staking_contract  = staking_amount + accumulated_total_roi_at_end_of_staking_contract;

        staking_roi_payment_startime_ts = parseInt(stakingMetaResponse.data.data.staking_roi_payment_startime_ts);
        staking_roi_payment_endtime_ts = parseInt(stakingMetaResponse.data.data.staking_roi_payment_endtime_ts);
        staking_last_withdrawal_ts = parseInt(stakingMetaResponse.data.data.staking_roi_last_withdrawal_ts);
         

        staking_roi_amount_remaining_to_be_paid = parseFloat(stakingMetaResponse.data.data.staking_roi_amount_remaining_to_be_paid);
        staking_roi_amount_withdrawn_so_far = parseFloat(stakingMetaResponse.data.data.staking_roi_amount_withdrawn_so_far);
       
    
    }
    
    staking_roi_accumulate_datetime_now_ts = Math.floor(Date.now() / 1000); // Converted to seconds
    datetime = new Date(staking_roi_accumulate_datetime_now_ts * 1000); // Converted to milliseconds for Date constructor
    formattedDateTime = datetime.toLocaleString(); 

    // Function to calculate accumulated ROI
    const count_number_of_staking_payment_interval_from_startime_till_now = Math.floor((staking_roi_accumulate_datetime_now_ts - staking_roi_payment_startime_ts) / timestamp_interval_values[staking_roi_payment_interval].ts);
    let accumulatedROINow = count_number_of_staking_payment_interval_from_startime_till_now * staking_roi_interval_payment_amount;

    // Calculate maximum_amount_user_can_withdraw_now 
    let maximum_amount_user_can_withdraw_now = (count_number_of_staking_payment_interval_from_startime_till_now * staking_roi_interval_payment_amount) - parseFloat(staking_roi_amount_withdrawn_so_far);


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


    // CHECKS
    if(amount_to_withdraw>maximum_amount_user_can_withdraw_now){//
        const response = {
            status: false,
            message: `You cannot withdraw amount (${amount_to_withdraw}) greater than maximum_amount_user_can_withdraw_now (${maximum_amount_user_can_withdraw_now})`,
            error : {
                    amount_to_withdraw: amount_to_withdraw,
                    count_number_of_staking_payment_interval_from_startime_till_now: count_number_of_staking_payment_interval_from_startime_till_now,
                    staking_roi_interval_payment_amount: staking_roi_interval_payment_amount,
                    staking_roi_amount_withdrawn_so_far : staking_roi_amount_withdrawn_so_far,
                    maximum_amount_user_can_withdraw_now: maximum_amount_user_can_withdraw_now
                }
            };

       return res.status(400).send(response);
    }

       
    const staking_roi_amount_remaining_to_be_paid_new = parseFloat(staking_roi_amount_remaining_to_be_paid)  - parseFloat(amount_to_withdraw);
    const staking_roi_amount_withdrawn_so_far_new = parseFloat(staking_roi_amount_withdrawn_so_far) + parseFloat(amount_to_withdraw);
   

    // CHECKS amount_to_withdraw>accumulated_roi_user_can_withdraw_now
    if(amount_to_withdraw>accumulated_roi_user_can_withdraw_now){
        const response = {
            status: false,
            status_code: 400,
            message: `You cannot withdraw amount (${amount_to_withdraw}) greater than accumulatedROINow - ${accumulated_roi_user_can_withdraw_now}`,
            error: {}
        };

       return res.status(400).send(response);
    }

    if(amount_to_withdraw>staking_roi_amount_remaining_to_be_paid){
        const response = {
            status: false,
            status_code: 400,
            message: `You cannot withdraw amount (${amount_to_withdraw}) greater than staking Amount Remaining to be paid - ${staking_roi_amount_remaining_to_be_paid}`,
            error: {}
        };

       return res.status(400).send(response);
    }

    // Call endpoint to update staking transaction
    let updateStakingRequestBody 
    if (staking_roi_payment_pattern=="internal_pattern_2") {

        updateStakingRequestBody = {
                "staking_roi_amount_remaining_to_be_paid_internal_pattern_2": staking_roi_amount_remaining_to_be_paid_new,
                "staking_roi_amount_withdrawn_so_far_internal_pattern_2": staking_roi_amount_withdrawn_so_far_new,
                "update_staking_request_timestamp" : Math.floor(Date.now() / 1000)
                }
    }
    else{

        updateStakingRequestBody = {
                "staking_roi_amount_remaining_to_be_paid": staking_roi_amount_remaining_to_be_paid_new,
                "staking_roi_amount_withdrawn_so_far": staking_roi_amount_withdrawn_so_far_new,
                "update_staking_request_timestamp" : Math.floor(Date.now() / 1000)
                }

    }
   
    const updateStakingTransactionReponse = await axios.put(stakingMetaUrl, updateStakingRequestBody, {
        headers: {
            'x-api-key': MODULE1_STAKING_API_KEY
        }
    });
    
    let updateStakingTransactionReponseDisplay = updateStakingTransactionReponse.data;
    




    // Calculate accumulated amount based on ROI
    let accumulatedTotalAmountNow = staking_amount + accumulatedROINow;

    // Proceed to withdraw Accumulated ROI Interest
    // Step 4: Credit user
        const roiCreditUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/rimplenet/v1/credits`;

        const roiCreditRequestBody = {
            "request_id": roi_credit_request_id,
            "user_id": user_id,
            "amount": amount_to_withdraw,
            "wallet_id": staking_roi_payment_wallet_id,
            "note": "Staking ROI Interest Accumulated",
            "meta_data": {
                "staking_parent_transaction_id": stakingTransactionID,
                "staking_roi_payment_pattern": staking_roi_payment_pattern,//can be internal_pattern_1 or internal_pattern_2 or external_pattern_1 or external_pattern_johndoeprovider
               
                "accumulated_roi_user_can_withdraw_now": accumulated_roi_user_can_withdraw_now,
                "accumulated_roi_user_have_already_withdraw": accumulated_roi_user_have_already_withdraw,
                "accumulated_roi_now": accumulatedROINow,
                "accumulated_total_amount_now": accumulatedTotalAmountNow,
                "accumulated_total_roi_at_end_of_staking_contract": accumulated_total_roi_at_end_of_staking_contract,
                "accumulated_total_amount_at_end_of_staking_contract": accumulated_total_amount_at_end_of_staking_contract,
                "accumulated_timestamp_retrieved_at": staking_roi_accumulate_datetime_now_ts,
                "accumulated_datetime_retrieved_at": formattedDateTime,

                "transaction_action_type": "staking_roi_interest_payment",
                "transaction_type_category": "staking",
                "transaction_external_processor": "middleware1",
                "transaction_approval_status": "user_middleware_processed",
                "transaction_approval_method": "middleware"
            }
        };

        const roiCreditResponse = await axios.post(roiCreditUrl, roiCreditRequestBody, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
            }
        });

  
        let addMetaStakingTransactionReponseDisplay;
        try {
            let txn_payment_id = roiCreditResponse.data.data.transaction_id;
            const addMetaStakingRequestBody = {
                [`staking_roi_payment_request_${request_id}`]: txn_payment_id,

                ["staking_roi_payment_transaction_id"]: txn_payment_id,
                [`staking_roi_payment_transaction_id_payment_time_${txn_payment_id}`]: Math.floor(Date.now() / 1000),
                [`staking_roi_payment_request_id_${txn_payment_id}`]: roi_credit_request_id,
                [`staking_roi_payment_amount_${txn_payment_id}`]: amount_to_withdraw,

                [`staking_roi_payment_transaction_id_payment_time`]: Math.floor(Date.now() / 1000),
                ["staking_roi_payment_request_id"]: roi_credit_request_id,
                ["staking_roi_payment_amount"]: amount_to_withdraw
            };
            const addMetaStakingTransactionReponse = await axios.post(stakingMetaUrl, addMetaStakingRequestBody, {
                headers: {
                    'x-api-key': MODULE1_STAKING_BASE_URL
                }
            });
            addMetaStakingTransactionReponseDisplay = addMetaStakingTransactionReponse.data;
        } catch (error) {
            // Handle error as needed
            console.error('Error in addMetaStakingTransactionReponseDisplay request:', error);
            if (error.response && error.response.data) {
                addMetaStakingTransactionReponseDisplay = error.response.data;
            } else {
                addMetaStakingTransactionReponseDisplay = error;
            }
        }

        // Success response
        const response = {
            status: true,
            status_code: 200,
            message: "Staking ROI Withdrawal Successful",
            data: { 
                    updateStakingTransactionReponse : updateStakingTransactionReponseDisplay,
                    roiCreditResponse : roiCreditResponse.data,
                    addMetaStakingTransactionReponse : addMetaStakingTransactionReponseDisplay
                  }
        };
        //Display the response
        return res.send(response);
    
    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

module.exports = router;

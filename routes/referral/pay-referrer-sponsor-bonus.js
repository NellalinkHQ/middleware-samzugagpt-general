var express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
var router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Get Environment Var set from ENV
const MODULE1_BASE_URL = process.env.MODULE1_BASE_URL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_BASE_USER_JWT_SECRET_KEY = process.env.MODULE1_BASE_USER_JWT_SECRET_KEY;


// Import userWalletBalanceCheck middleware
const userWalletBalanceCheck = require('../../middleware-utils/user-wallet-balance-check');
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');


router.post('/', async function(req, res, next) {
    try {
        // Extracting data from the request body
        const { user_id, wallet_id, trigger, trigger_point } = req.body;

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
        

        // if(parseFloat(swap_amount)<=0){
        //     const response = {
        //         status: false,
        //         status_code: 400,
        //         message: `Swap Amount Invalid or Less than 0`,
        //         error_data: {
        //             // swap_rate : swap_rate_1_wallet_from_to_wallet_to,
        //             // swap_total_quantity_available: swap_total_quantity_available,
        //         }
        //     };
        //     return res.status(400).send(response);
        // }

        // // Step 1: Check balance of user
        // // Create userbalanceCheck middleware with parameters extracted from request body
        // const balanceCheckMiddleware = userWalletBalanceCheck(MODULE1_BASE_URL, MODULE1_BASE_API_KEY, userBearerJWToken, user_id, wallet_id_from, swap_amount);

        // // Call balanceMiddleware
        // await balanceCheckMiddleware(req, res, next);

        // //Get Swap Rate

        // let swap_rate_key = `${wallet_id_from}_to_${wallet_id_to}`;

        // // Construct the meta key URL
        // let meta_key_url = `swap_rate_1_${swap_rate_key},swap_total_quantity_available_${swap_rate_key},swap_minimum_quantity_per_request_${swap_rate_key},swap_maximum_quantity_per_request_${swap_rate_key},swap_rate_user_id_updated_by_${swap_rate_key},swap_rate_user_id_updated_time_${swap_rate_key},swap_transaction_id_debited_for_funding_${swap_rate_key},swap_user_id_debited_for_funding_${swap_rate_key}`;

        // // Construct the GET meta URL
        // const getMetaUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/site-wide?meta_key=${meta_key_url}`;

        // // Make the GET request to fetch metadata
        // const getMetaResponse = await axios.get(getMetaUrl, {
        //     headers: {
        //         'x-api-key': MODULE1_BASE_API_KEY,
        //         'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
        //     }
        // });

        
        // let swap_rate_key_resp= `swap_rate_1_${swap_rate_key}`;
        // let swap_rate_1_wallet_from_to_wallet_to = parseInt(getMetaResponse.data.data[swap_rate_key_resp]) || 0;

        // let swap_total_quantity_available_key = `swap_total_quantity_available_${swap_rate_key}`;
        // let swap_total_quantity_available = parseInt(getMetaResponse.data.data[swap_total_quantity_available_key]) || 0;
        
        // if(swap_rate_1_wallet_from_to_wallet_to<=0 || swap_total_quantity_available<swap_amount){
        //     const response = {
        //         status: false,
        //         status_code: 400,
        //         message: `Insufficient Swap Liquidity or Swap not enabled for Pair ${swap_rate_key}`,
        //         error_data: {
        //             swap_rate : swap_rate_1_wallet_from_to_wallet_to,
        //             swap_total_quantity_available: swap_total_quantity_available,


        //         }
        //     };
        //     return res.status(400).send(response);
        // }

        // There is Sufficient Balance, Proceed with the Process
        // Step 1: Get user
        //let wallet_id = "bnb";
        let referral_bonus_amount = 10;
        let referrer_sponsor_user_id = 1;
        let referrer_downline_user_id = user_id;

        // can be deposit, staking, kyc_update, withdrawal
        //params should be generlaized like trigger : deposit, get amount of that trigger - 20, 
        //then calculate the bonus amount based on what was set for trigger, supported wallet_id


        // Step 3: Credit user
        let creditResponseDisplay;
        try {
            const creditUrl = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/credits`;
            const creditRequestBody = {
                "request_id": `referral_bonus_from_user_${referrer_downline_user_id}`,
                "user_id": referrer_sponsor_user_id,
                "amount": referral_bonus_amount,
                "wallet_id": wallet_id,
                "note": `Referral Bonus`,
                "meta_data": { 
                    "referrer_sponsor_user_id": referrer_sponsor_user_id,
                    "referrer_downline_user_id": referrer_downline_user_id,

                    "transaction_action_type": `referral_bonus_on_${trigger_point}`,
                    "transaction_type_category": "referral_bonus",
                    "transaction_external_processor": "middleware1",
                    "transaction_approval_status": "backend_middleware_processed",
                    "transaction_approval_method": "middleware"
                }
            };

            const creditResponse = await axios.post(creditUrl, creditRequestBody, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
                }
            });

            creditResponseDisplay = creditResponse.data;
        } catch (error) {
            // Handle error as needed
            console.error('Error in creditResponse request:', error);
            if (error.response && error.response.data) {
                creditResponseDisplay = error.response.data;
            } else {
                creditResponseDisplay = error;
            }
        }


        // let sitewideMetaUpdateResponseDisplay;
        // try {
        //     let swap_quantity_remaining = swap_total_quantity_available - swap_amount;
        //     const updateMetaUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/site-wide`;
        //     const metaUpdateRequestBody = {
        //         ['swap_total_quantity_available_' + swap_rate_key]: swap_quantity_remaining,
        //         };

        //     const metaUpdateResponse = await axios.put(updateMetaUrl, metaUpdateRequestBody, {
        //         headers: {
        //             'x-api-key': MODULE1_BASE_API_KEY,
        //             'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
        //         }
        //     });

        //     sitewideMetaUpdateResponseDisplay = metaUpdateResponse.data;
        // } catch (error) {
        //     // Handle error as needed
        //     console.error('Error in metaUpdateResponse request:', error);
        //     if (error.response && error.response.data) {
        //         sitewideMetaUpdateResponseDisplay = error.response.data;
        //     } else {
        //         sitewideMetaUpdateResponseDisplay = error;
        //     }
        // }

        // Success response
        const response = {
            status: true,
            status_code: 200,
            message: "Referral Bonus Process Completed Successfully",
            data: {
                referralCreditResponse: creditResponseDisplay,
                //sitewideMetaUpdateResponse : sitewideMetaUpdateResponseDisplay
            }
        };

        return res.send(response);
    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

module.exports = router;


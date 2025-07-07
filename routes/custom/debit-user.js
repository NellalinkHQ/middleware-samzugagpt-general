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
const userWalletBalanceCheckUtils = require('../../middleware-utils/user-wallet-balance-check');
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');


router.post('/', async function(req, res, next) {
    try {
        // Extracting data from the request body
        const { request_id, request_action_name, user_id } = req.body;

        const amount = 5;
        const wallet_id = "szcb";

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
        
        if ( request_action_name!="community_membership_registration") {

            const response = {
                status: false,
                status_code: 400,
                message: `Unknown Request Action`,
                error: {
                    request_action_name : request_action_name,
                    // swap_total_quantity_available: swap_total_quantity_available,
                }
            };
            return res.status(400).send(response);
        }

        if(parseFloat(amount)<=0){
            const response = {
                status: false,
                status_code: 400,
                message: `Amount Invalid or Less than 0`,
                error: {
                    amount : amount,
                    // swap_total_quantity_available: swap_total_quantity_available,
                }
            };
            return res.status(400).send(response);
        }

        // Step 1: Check balance of user
        // Create userbalanceCheck middleware with parameters extracted from request body
        const balanceCheckResult = await userWalletBalanceCheckUtils(MODULE1_BASE_URL, MODULE1_BASE_API_KEY, userBearerJWToken, user_id, wallet_id, amount);

        
        if (balanceCheckResult.status!=true) {
            console.log("balanceCheckResult Not Sufficient ", balanceCheckResult);
            return res.status(400).send(balanceCheckResult);// Return if balance Result is not sufficient
        }
        // There is Sufficient Balance, Proceed with the Process
        // Step 2: Debit user
        let debitResponseDisplay, debitSuccessful;
        try {
            const debitUrl = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/debits`;
            const debitRequestBody = {
                "request_id": `community_membership_registration_by_user_${user_id}`,
                "user_id": user_id,
                "amount": amount,
                "wallet_id": wallet_id,
                "note": `Community Membership Registration`,
                "meta_data": {
                    "alt_request_id": `community_membership_registration_from_user_${user_id}`,
                   // "alt_transaction_id": 'to_be_determined_later',

                    "transaction_action_type": `community_membership_registration_debit`,
                    "transaction_type_category": "community_membership_registration",
                    "transaction_external_processor": "middleware1",
                    "transaction_approval_status": "user_middleware_processed",
                    "transaction_approval_method": "middleware"
                 }
            };

            const debitResponse = await axios.post(debitUrl, debitRequestBody, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
                }
            });

            debitResponseDisplay = debitResponse.data;
            debitSuccessful = debitResponse.data.status;
        }
        catch (error) {
            // Handle error as needed
            console.error('Error in creditResponse request:', error);
            if (error.response && error.response.data) {
                debitResponseDisplay = error.response.data;
                debitSuccessful = true;
            } else {
                debitResponseDisplay = error;
            }
        }

        

        // Step 3: Credit user

        let creditResponseDisplay, creditSuccessful;
        if (debitSuccessful) {

            try {
                const creditUrl = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/credits`;
                const creditRequestBody = {
                    "request_id": `community_membership_registration_from_user_${user_id}`,
                    "user_id": 1,
                    "amount": amount,
                    "wallet_id": wallet_id,
                    "note": `Community Membership Registration from User - ${user_id}`,
                    "meta_data": {
                        "alt_request_id": `community_membership_registration_by_user_${user_id}`,
                       // "alt_transaction_id": debitResponse.data.data.transaction_id,

                        "transaction_action_type": `community_membership_registration_credit`,
                        "transaction_type_category": "community_membership_registration",
                        "transaction_external_processor": "middleware1",
                        "transaction_approval_status": "user_middleware_processed",
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
                creditSuccessful = creditResponse.data.status;
            } catch (error) {
                // Handle error as needed
                console.error('Error in creditResponse request:', error);
                if (error.response && error.response.data) {
                    creditResponseDisplay = error.response.data;
                    creditSuccessful = true;
                } else {
                    creditResponseDisplay = error;
                }
            }

        }


        let userMetaUpdateResponseDisplay;
        if (debitSuccessful && creditSuccessful) {

        
            try {
                const updateMetaUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/user/${user_id}`;
                const metaUpdateRequestBody = {
                    ['registered_as_community_member']: "yes",
                    ['registered_as_community_member_timestamp']: Math.floor(Date.now()/1000),
                    ['registered_as_community_member_at_request_id']: `community_membership_registration_by_user_${user_id}`,
                    };

                const metaUpdateResponse = await axios.put(updateMetaUrl, metaUpdateRequestBody, {
                    headers: {
                        'x-api-key': MODULE1_BASE_API_KEY,
                        'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
                    }
                });

                userMetaUpdateResponseDisplay = metaUpdateResponse.data;
            } catch (error) {
                // Handle error as needed
                console.error('Error in metaUpdateResponse request:', error);
                if (error.response && error.response.data) {
                    userMetaUpdateResponseDisplay = error.response.data;
                } else {
                    userMetaUpdateResponseDisplay = error;
                }
            }
        }


        // Success response
        const response = {
            status: true,
            status_code: 200,
            message: "Debit Action Process Completed Successfully",
            data: {
                debitResponse: debitResponseDisplay,
                creditResponse: creditResponseDisplay,
                userMetaUpdateResponse : userMetaUpdateResponseDisplay
            }
        };

        return res.send(response);
    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

module.exports = router;


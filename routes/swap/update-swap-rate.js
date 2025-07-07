var express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
var router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Import userWalletBalanceCheck middleware
const userWalletBalanceCheckUtils = require('../../middleware-utils/user-wallet-balance-check');
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');



// Get Environment Var set from ENV
const MODULE1_BASE_URL = process.env.MODULE1_BASE_URL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_BASE_USER_JWT_SECRET_KEY = process.env.MODULE1_BASE_USER_JWT_SECRET_KEY;




router.put('/', async function(req, res, next) {
    try {
        // Extracting data from the request body
        const { request_id, user_id, wallet_id_from, wallet_id_to, swap_rate, swap_quantity_to_add,
                swap_minimum_quantity_per_request, swap_maximum_quantity_per_request, swap_user_id_to_debit_for_funding } = req.body;

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

        // Step 1: Check balance of user
        // Create userbalanceCheck middleware with parameters extracted from request body
        //const userWalletBalanceResult = await userWalletBalanceCheckUtils(MODULE1_BASE_URL, MODULE1_BASE_API_KEY, userBearerJWToken, user_id, wallet_id_from, swap_quantity_to_add);

        // Call balanceMiddleware
        //await balanceCheckMiddleware(req, res, next);

        //Get Swap Rate
        let swap_rate_key = `${wallet_id_from}_to_${wallet_id_to}`;
        let swap_rate_1_wallet_from_to_wallet_to = swap_rate;

        // There is Sufficient Balance, Proceed with the Process
        // Step 2: Debit user
        // const debitUrl = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/debits`;
        // const debitRequestBody = {
        //     "request_id": `swap_debit_request_${request_id}`,
        //     "user_id": user_id,
        //     "amount": swap_amount,
        //     "wallet_id": wallet_id_from,
        //     "note": `Swap Debit ~ ${wallet_id_from} to ${wallet_id_to}`,
        //     "meta_data": {
        //         "swap_alt_request_id": `swap_credit_request_${request_id}`,

        //         "swap_wallet_id_from": wallet_id_from,
        //         "swap_wallet_id_to": wallet_id_to,
        //         "swap_rate_key": swap_rate_key,
        //         "swap_rate": swap_rate_1_wallet_from_to_wallet_to,
        //         "swap_wallet_id_from_amount": swap_amount,
        //         "swap_wallet_id_to_amount": swap_amount,

        //         "transaction_action_type": `user_wallet_balance_swap_from_${wallet_id_from}_to_${wallet_id_to}`,
        //         "transaction_type_category": "user_wallet_balance_swap",
        //         "transaction_external_processor": "middleware1",
        //         "transaction_approval_status": "user_middleware_processed",
        //         "transaction_approval_method": "middleware"
        //     }
        // };

        // const debitResponse = await axios.post(debitUrl, debitRequestBody, {
        //     headers: {
        //         'x-api-key': MODULE1_BASE_API_KEY,
        //         'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
        //     }
        // });

        // Step 3: Update Meta Sitewide
        let sitewideMetaUpdateResponseDisplay;
        try {
            const updateMetaUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/site-wide`;
            const metaUpdateRequestBody = {
                ['swap_rate_1_' + swap_rate_key]: swap_rate_1_wallet_from_to_wallet_to,
                ['swap_total_quantity_available_' + swap_rate_key]: swap_quantity_to_add,
                ['swap_minimum_quantity_per_request_' + swap_rate_key]: swap_minimum_quantity_per_request,
                ['swap_maximum_quantity_per_request_' + swap_rate_key]: swap_maximum_quantity_per_request,
                ['swap_rate_user_id_updated_by_' + swap_rate_key]: user_id,
                ['swap_rate_user_id_updated_time_' + swap_rate_key]: Date.now(),
                ['swap_transaction_id_debited_for_funding_' + swap_rate_key]: user_id,
                ['swap_user_id_debited_for_funding_' + swap_rate_key]: swap_user_id_to_debit_for_funding,
            };

            const metaUpdateResponse = await axios.put(updateMetaUrl, metaUpdateRequestBody, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
                }
            });

            sitewideMetaUpdateResponseDisplay = metaUpdateResponse.data;
        } catch (error) {
            // Handle error as needed
            console.error('Error in metaUpdateResponse request:', error);
            if (error.response && error.response.data) {
                sitewideMetaUpdateResponseDisplay = error.response.data;
            } else {
                sitewideMetaUpdateResponseDisplay = error;
            }
        }

        // Success response
        const response = {
            status: true,
            status_code: 200,
            message: "Swap Rate Settings Updated Succesfully",
            data: {
                //swapDebitResponse: debitResponse.data,
                sitewideMetaUpdateResponse: sitewideMetaUpdateResponseDisplay
            }
        };

        return res.send(response);
    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

module.exports = router;


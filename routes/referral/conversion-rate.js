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

router.get('/', async function(req, res, next) {
    try {
        // Extracting data from the request body
        const { other_data } = req.body;

        let user_id = parseInt(req.query.user_id) || 0;
        let wallet_id_from = req.query.wallet_id_from || '';
        let wallet_id_to = req.query.wallet_id_to || '';

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

        // Step 1: Get Swap Rate

        let swap_rate_key = `${wallet_id_from}_to_${wallet_id_to}`;

        // Construct the meta key URL
        let meta_key_url = `swap_rate_1_${swap_rate_key},swap_total_quantity_available_${swap_rate_key},swap_minimum_quantity_per_request_${swap_rate_key},swap_maximum_quantity_per_request_${swap_rate_key},swap_rate_user_id_updated_by_${swap_rate_key},swap_rate_user_id_updated_time_${swap_rate_key},swap_transaction_id_debited_for_funding_${swap_rate_key},swap_user_id_debited_for_funding_${swap_rate_key}`;

        // Construct the GET meta URL
        const getMetaUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/site-wide?meta_key=${meta_key_url}`;

        // Make the GET request to fetch metadata
        const getMetaResponse = await axios.get(getMetaUrl, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
            }
        });

        
        let swap_rate_key_resp = `swap_rate_1_${swap_rate_key}`;
        let swap_rate_1_wallet_from_to_wallet_to = parseInt(getMetaResponse.data.data[swap_rate_key_resp]) || 0;

        let swap_total_quantity_available_key = `swap_total_quantity_available_${swap_rate_key}`;
        let swap_total_quantity_available = parseInt(getMetaResponse.data.data[swap_total_quantity_available_key]) || 0;
        
        if(swap_rate_1_wallet_from_to_wallet_to<=0){
            const response = {
                status: true,
                status_code: 200,
                message: `Swap not enabled for Pair ${swap_rate_key}`,
                data: {
                    swap_rate_key: swap_rate_key,
                    swap_rate: 0,
                    wallet_id_from: wallet_id_from,
                    wallet_id_to: wallet_id_to,
                    swap_total_quantity_available: 0,
                    swap_minimum_quantity_per_request: 0,
                    swap_maximum_quantity_per_request: 0
                }
            };
            return res.send(response);
        }
        

        function convertNumericStrToInt(obj) {
            for (const key in obj) {
                if (!isNaN(obj[key]) && !Array.isArray(obj[key])) {
                    obj[key] = parseInt(obj[key]);
                } else if (typeof obj[key] === 'object') {
                    convertNumericStrToInt(obj[key]);
                }
            }
        }


        //Build Response data
        let conversion_rate_data
        if (getMetaResponse.data.data) {
            
            let swap_minimum_quantity_per_request = parseInt(getMetaResponse.data.data[`swap_minimum_quantity_per_request_${swap_rate_key}`]) || 0;
            let swap_maximum_quantity_per_request = parseInt(getMetaResponse.data.data[`swap_maximum_quantity_per_request_${swap_rate_key}`]) || 0;

            conversion_rate_data = {
                swap_rate_key: swap_rate_key,
                swap_rate: swap_rate_1_wallet_from_to_wallet_to,
                wallet_id_from: wallet_id_from,
                wallet_id_to: wallet_id_to,
                swap_total_quantity_available: swap_total_quantity_available,
                swap_minimum_quantity_per_request: swap_minimum_quantity_per_request,
                swap_maximum_quantity_per_request: swap_maximum_quantity_per_request,

                ...getMetaResponse.data.data
            };

            //convert numbers to int
            convertNumericStrToInt(conversion_rate_data);

        }

        // Success response
        const response = {
            status: true,
            status_code: 200,
            message: "Swap Conversion Rate Retrieved",
            data: conversion_rate_data
            
        };

        res.send(response);
    } catch (error) {
        let error_info;
        if (error.response && error.response.data) {
            error_info = error.response.data;
            if(error.response.data.message){
                error.message = error.response.data.message +" - "+error.message;
            }

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


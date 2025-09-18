var express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
var router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());


const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');
const { withdrawUserBEP20toCentralAddress, getAddressMetaData } = require('../cryptocurrency/utils');
const { getEvmMonitoredAddresses, addEvmMonitoredAddress } = require('../cryptocurrency/manage-evm-monitored-addresses');

// Get Environment Var set from ENV
const MODULE1_BASE_URL = process.env.MODULE1_BASE_URL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_BASE_USER_JWT_SECRET_KEY = process.env.MODULE1_BASE_USER_JWT_SECRET_KEY;

router.post('/', async function(req, res, next) {
    try {
        // Extracting data from the request body
        const { user_id, meta_data } = req.body;

        //let user_id = parseInt(req.query.user_id) || 0;

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
        

        if (!user_id) {
            const response = {
                status: false,
                status_code: 400,
                message: 'user_id required',
                error: { 
                        error_data: {
                            user_id : user_id
                            }
                        }
            };
            return res.status(400).send(response); // Return response if not added
        }

       const user_address_meta = await getAddressMetaData(user_id);
       const user_address = user_address_meta.data.address;

        // Add user address to EVM monitoring system
        const evmAddResult = addEvmMonitoredAddress(user_address);
        console.log(`🔍 EVM Monitoring: ${evmAddResult.message} - ${user_address}`);

        let response = {
            status: true,
            status_code: 200,
            message: "Trigger - Login Success",
            data: {
                user_address: user_address,
                user_address_meta: user_address_meta,
                evm_monitoring: {
                    added: evmAddResult.status,
                    message: evmAddResult.message,
                    total_monitored: getEvmMonitoredAddresses().length
                }
            }
        };

        return res.send(response);
    } catch (error) {
        // Handle errors using custom error handling middleware
        handleTryCatchError(res, error);
    }
});

module.exports = router;

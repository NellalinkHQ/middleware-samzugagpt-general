var express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
var router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());


const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');
const { withdrawUserBNBtoCentralAddress, pushUserBNBTransactionstoUserWallet, withdrawUserBEP20toCentralAddress, pushUserBEP20TransactionstoUserWallet, getAddressMetaData } = require('../cryptocurrency/utils');

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


        // Withdraw USDT to Central Address
        let withdrawUSDTtoCentralAddressResponseDisplay;
        try {
             let from_address = user_address;
             withdrawUSDTtoCentralAddressResponseDisplay = await withdrawUserBEP20toCentralAddress(user_id, from_address, '0x55d398326f99059ff775485246999027b3197955');

        } catch (error) {
            // Handle error as needed
            console.error('Error in withdrawUserBEP20toCentralAddress request:', error);
            if (error.response && error.response.data) {
                withdrawUSDTtoCentralAddressResponseDisplay = error.response.data;
            } else {
                withdrawUSDTtoCentralAddressResponseDisplay = error;
            }
        }
        // Push USDT to User Wallet 
        let pushUSDTtoUserWalletResponseDiplay;
        try {
             let from_address = user_address;
             pushUSDTtoUserWalletResponseDiplay = await pushUserBEP20TransactionstoUserWallet(user_id, from_address, '0x55d398326f99059ff775485246999027b3197955');

        } catch (error) {
            // Handle error as needed
            console.error('Error in withdrawUserBEP20toCentralAddress request:', error);
            if (error.response && error.response.data) {
                pushUSDTtoUserWalletResponseDiplay = error.response.data;
            } else {
                pushUSDTtoUserWalletResponseDiplay = error;
            }
        }


        // Withdraw HYCA to Central Address
        let withdrawHYCAtoCentralAddressResponseDisplay;
        try {
             let from_address = user_address;
             withdrawHYCAtoCentralAddressResponseDisplay = await withdrawUserBEP20toCentralAddress(user_id, from_address, '0x702371e0897f5e2f566b1ce8256856d0549c5857');

        } catch (error) {
            // Handle error as needed
            console.error('Error in withdrawUserBEP20toCentralAddress request:', error);
            if (error.response && error.response.data) {
                withdrawHYCAtoCentralAddressResponseDisplay = error.response.data;
            } else {
                withdrawHYCAtoCentralAddressResponseDisplay = error;
            }
        }
        // Push HYCA to User Wallet 
        let pushHYCAtoUserWalletResponseDiplay;
        try {
             let from_address = user_address;
             pushHYCAtoUserWalletResponseDiplay = await pushUserBEP20TransactionstoUserWallet(user_id, from_address, '0x702371e0897f5e2f566b1ce8256856d0549c5857');

        } catch (error) {
            // Handle error as needed
            console.error('Error in withdrawUserBEP20toCentralAddress request:', error);
            if (error.response && error.response.data) {
                pushHYCAtoUserWalletResponseDiplay = error.response.data;
            } else {
                pushHYCAtoUserWalletResponseDiplay = error;
            }
        }

        // Withdraw SZCB2 to Central Address
        let withdrawSZCB2toCentralAddressResponseDisplay;
        try {
             let from_address = user_address;
             withdrawSZCB2toCentralAddressResponseDisplay = await withdrawUserBEP20toCentralAddress(user_id, from_address, '0xb4e62a01909f49fc30de2bf92f3a554f2f636360');

        } catch (error) {
            // Handle error as needed
            console.error('Error in withdrawUserBEP20toCentralAddress request:', error);
            if (error.response && error.response.data) {
                withdrawSZCB2toCentralAddressResponseDisplay = error.response.data;
            } else {
                withdrawSZCB2toCentralAddressResponseDisplay = error;
            }
        }
        // Push SZCB to User Wallet 
        let pushSZCB2toUserWalletResponseDiplay;
        try {
             let from_address = user_address;
             pushSZCB2toUserWalletResponseDiplay = await pushUserBEP20TransactionstoUserWallet(user_id, from_address, '0xb4e62a01909f49fc30de2bf92f3a554f2f636360');

        } catch (error) {
            // Handle error as needed
            console.error('Error in withdrawUserBEP20toCentralAddress request:', error);
            if (error.response && error.response.data) {
                pushSZCB2toUserWalletResponseDiplay = error.response.data;
            } else {
                pushSZCB2toUserWalletResponseDiplay = error;
            }
        }



        // Withdraw BNB to Central Address
        let withdrawUserBNBtoCentralAddressResponseDisplay;
        try {
             let from_address = user_address;
             withdrawUserBNBtoCentralAddressResponseDisplay = await withdrawUserBNBtoCentralAddress(user_id, from_address);

        } catch (error) {
            // Handle error as needed
            console.error('Error in withdrawUserBNBtoCentralAddress request:', error);
            if (error.response && error.response.data) {
                withdrawUserBNBtoCentralAddressResponseDisplay = error.response.data;
            } else {
                withdrawUserBNBtoCentralAddressResponseDisplay = error;
            }
        }
        // Push BNB to User Wallet 
        let pushBNBtoUserWalletResponseDiplay;
        try {
             let from_address = user_address;
             pushBNBtoUserWalletResponseDiplay = await pushUserBNBTransactionstoUserWallet(user_id, from_address);

        } catch (error) {
            // Handle error as needed
            console.error('Error in pushBNBtoUserWalletResponseD request:', error);
            if (error.response && error.response.data) {
                pushBNBtoUserWalletResponseDiplay = error.response.data;
            } else {
                pushBNBtoUserWalletResponseDiplay = error;
            }
        }

        let response = {
            status: true,
            status_code: 200,
            message: "Trigger - Dashboard Refresh Successful",
            data: {
                withdraw_usdt_to_central_address_response : withdrawUSDTtoCentralAddressResponseDisplay,
                push_usdt_to_user_wallet_response : pushUSDTtoUserWalletResponseDiplay,
                withdraw_hyca_to_central_address_response : withdrawHYCAtoCentralAddressResponseDisplay,
                push_hyca_to_user_wallet_response : pushHYCAtoUserWalletResponseDiplay,
                withdraw_szcb2_to_central_address_response : withdrawSZCB2toCentralAddressResponseDisplay,
                push_szcb2_to_user_wallet_response : pushSZCB2toUserWalletResponseDiplay,
                withdraw_bnb_to_central_address_response : withdrawUserBNBtoCentralAddressResponseDisplay,
                push_bnb_to_user_wallet_response : pushBNBtoUserWalletResponseDiplay,
                user_address: user_address,
                user_address_meta: user_address_meta
            }
        };

        return res.send(response);
    } catch (error) {
        // Handle errors using custom error handling middleware
        handleTryCatchError(res, error);
    }
});

module.exports = router;


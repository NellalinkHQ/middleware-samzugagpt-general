var express = require('express');
const axios = require('axios');
var router = express.Router();
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');

const MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL = process.env.MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY || 'YourApiKey';
const MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK.toLowerCase();
const MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS = process.env.MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS.toLowerCase();

/* Deposit and Refresh Balance for user */
router.get('/:userAddress', async function(req, res, next) {
    try {
        const userAddress = req.params.userAddress.toLowerCase();

        // Dynamically retrieve the base URL
        const baseURL = `${req.protocol}://${req.get('host')}`;

        // Call the first endpoint to withdraw deposited transactions to central address
        let withdrawTransactionToCentralAddressResponse, withdrawTransactionToCentralAddressResponseDisplay;
        try {
            withdrawTransactionToCentralAddressResponse = await axios.get(`${baseURL}/cryptocurrency/bscscan/bnb/withdraw-deposited-transactions-to-central-address/${userAddress}`, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY
                }
            });
            withdrawTransactionToCentralAddressResponseDisplay = withdrawTransactionToCentralAddressResponse.data;
        } catch (error) {
            // Handle error as needed
            console.error('Error in withdrawTransactionToCentralAddressResponse request:', error);
            if (error.response && error.response.data) {
            	withdrawTransactionToCentralAddressResponseDisplay = error.response.data;
	        } else {
	            withdrawTransactionToCentralAddressResponseDisplay = error;
	        }

        }

        // Call the second endpoint to perform actions after central address withdrawal
        let pushTransactionActionResponse, pushTransactionActionResponseDisplay;
        try {
            pushTransactionActionResponse = await axios.get(`${baseURL}/cryptocurrency/bscscan/bnb/actions-after-central-address-withdrawal/push-transactions/address/${userAddress}`, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY
                }
            });
            pushTransactionActionResponseDisplay = pushTransactionActionResponse.data;
        } catch (error) {
            // Handle error as needed
            console.error('Error in pushTransactionActionResponse request:', error);
            if (error.response && error.response.data) {
            	pushTransactionActionResponseDisplay = error.response.data;
	        } else {
	            pushTransactionActionResponseDisplay = error;
	        }
        }


        // Call the third endpoint
        // let pushTransactionActionResponse, pushTransactionActionResponseDisplay;
        // try {
        //     pushTransactionActionResponse = await axios.get(`${baseURL}/cryptocurrency/bscscan/bnb/actions-after-central-address-withdrawal/push-transactions/address/${userAddress}`, {
        //         headers: {
        //             'x-api-key': MODULE1_BASE_API_KEY
        //         }
        //     });
        //     pushTransactionActionResponseDisplay = pushTransactionActionResponse.data;
        // } catch (error) {
        //     // Handle error as needed
        //     console.error('Error in pushTransactionActionResponse request:', error);
        //     if (error.response && error.response.data) {
        //         pushTransactionActionResponseDisplay = error.response.data;
        //     } else {
        //         pushTransactionActionResponseDisplay = error;
        //     }
        // }

        let response = {
            status: true,
            status_code: 200,
            message: "Balance Refresh initiated Successfully",
            withdrawTransactionToCentralAddressResponse: withdrawTransactionToCentralAddressResponseDisplay, // Only include response data if the request was successful
            pushTransactionToAppResponse: pushTransactionActionResponseDisplay // Only include response data if the request was successful
        };

        return res.send(response);

    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

module.exports = router;

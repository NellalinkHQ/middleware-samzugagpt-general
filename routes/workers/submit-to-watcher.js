var express = require('express');
const bip39 = require('bip39');
const hdkey = require("hdkey");
const ethUtil = require("ethereumjs-util");
const axios = require('axios');
var router = express.Router();

const MODULE1_CRYPTOCURRENCY_MNEMONIC = process.env.MODULE1_CRYPTOCURRENCY_MNEMONIC;
const MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL = process.env.MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY || 'YourApiKey';
const MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK.toLowerCase();
const MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS = process.env.MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS.toLowerCase();

/* Deposit and Refresh Balance for user */
router.get('/:userID', async function(req, res, next) {
    try {
        const user_id = req.params.userID.toLowerCase();
        
        const mnemonic = MODULE1_CRYPTOCURRENCY_MNEMONIC; //generates string
        const seed = async () => {
            const testseed = await bip39.mnemonicToSeed(mnemonic);
            return testseed;
        };
        const testseed = await seed();
        const root = hdkey.fromMasterSeed(testseed);
        const masterPrivateKey = root.privateKey.toString("hex");
        const addrNode = root.derive("m/44'/60'/0'/0/" + user_id);
        const pubKey = ethUtil.privateToPublic(addrNode._privateKey);
        const address = "0x" + ethUtil.publicToAddress(pubKey).toString("hex");
        const address_checksum = ethUtil.toChecksumAddress(address);
        const privateKeyGen = addrNode._privateKey.toString('hex');
        
        // Dynamically retrieve the base URL
        const baseURLWatcher = `http://samzugagpt-middleware-blockchain-deposit-withdrawal.eu-4.evennode.com/v1`;

        let requestSubmitToWatcherResponse, requestSubmitToWatcherResponseDisplay;
        try {
            const requestSubmitToWatcherRequestBody = {
                "name": `User ${user_id}`,
                "walletAddress": address,
                "walletPK": `0x${privateKeyGen}`,
                "appUserId": user_id,
                "email": `user_${user_id}@example.com`,
                "password": "password1",
                "role": "user"
                };
            requestSubmitToWatcherResponse = await axios.post(`${baseURLWatcher}/users`,requestSubmitToWatcherRequestBody, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY
                }
            });
            requestSubmitToWatcherResponseDisplay = requestSubmitToWatcherResponse.data;
        } catch (error) {
            // Handle error as needed
            console.error('Error in withdrawTransactionToCentralAddressResponse request:', error);
            if (error.response && error.response.data) {
                requestSubmitToWatcherResponseDisplay = error.response.data;
            } else {
                requestSubmitToWatcherResponseDisplay = error;
            }

        }

        let response = {
            status: true,
            status_code: 200,
            message: "User Data Submitted to Watcher",
            data: {
                requestSubmitToWatcherResponse: requestSubmitToWatcherResponseDisplay,
                //address: address
                //privateKeyGen: privateKeyGen
            }
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

const express = require('express');
const axios = require('axios');
const { Web3 } = require('web3'); // Note: Web3 should be capitalized
const bip39 = require('bip39');
const hdkey = require("hdkey");
const ethUtil = require("ethereumjs-util");
const router = express.Router();

const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');
// Import the utils function 
const { withdrawUserBEP20toCentralAddress } = require('./utils');

const MODULE1_CRYPTOCURRENCY_MNEMONIC = process.env.MODULE1_CRYPTOCURRENCY_MNEMONIC;
const MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL = process.env.MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY || 'YourApiKey';
const MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK.toLowerCase();
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET;
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET;
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET;
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET;
const MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS = process.env.MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS.toLowerCase();

// Initialize Web3 with BSC testnet and mainnet endpoints
let web3_http, web3_wss;
try {
    if (MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK === "testnet") {
        web3_http = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET}`);
        web3_wss = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET}`);
    } else {
        web3_http = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET}`);
        web3_wss = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET}`);
    }

}
catch (error) { 
    console.error("Error occurred while initializing ENV providers:", error.message);
    // Handle the error as needed, for example, by providing a default value or exiting the program
}

/* Withdraw BNB from user's address to central address */
router.get('/:userAddress', async function (req, res, next) {
    try {
        const userAddress = req.params.userAddress.toLowerCase();

        const mnemonic = MODULE1_CRYPTOCURRENCY_MNEMONIC; //generates string
        const seed = async () => {
            const testseed = await bip39.mnemonicToSeed(mnemonic);
            return testseed;
        };
        const userMetaUrl1 = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/utils/check-if-meta-value-exists?meta_key=eth_crypto_wallet_deposit_address&meta_value=${userAddress}`;
        const userMetaUrlResponse1 = await axios.get(userMetaUrl1);

        let fromAddress, privateKey,user_id;
        if (userMetaUrlResponse1.data.data.eth_crypto_wallet_deposit_address.meta_value === userAddress) {
            user_id = userMetaUrlResponse1.data.data.eth_crypto_wallet_deposit_address.user_id;
            const testseed = await seed();
            const root = hdkey.fromMasterSeed(testseed);
            const masterPrivateKey = root.privateKey.toString("hex");
            const addrNode = root.derive("m/44'/60'/0'/0/" + user_id);
            const pubKey = ethUtil.privateToPublic(addrNode._privateKey);
            const address = "0x" + ethUtil.publicToAddress(pubKey).toString("hex");
            const address_checksum = ethUtil.toChecksumAddress(address);
            const privateKeyGen = addrNode._privateKey.toString('hex');
            fromAddress = userAddress;
            privateKey = privateKeyGen;
        } else {
            const response = {
                status: false,
                status_code: 400,
                message: 'User Address Mismatch',
                error: {
                    "userAddress": userAddress,
                    "UserMetaUrlResponse": userMetaUrlResponse1.data.data
                }
            };
            return res.status(400).send(response);
        }

        const balance = await web3_http.eth.getBalance(userAddress);
        const balanceInEther = web3_http.utils.fromWei(balance, 'ether');

        if (balanceInEther <= 0) {
            const response = {
                status: false,
                status_code: 400,
                message: 'User has zero BNB balance.',
                error: { "balanceInEther": balanceInEther }
            };

            convertBigIntToInt(response);
            return res.status(400).send(response);
        }

        const gasPrice = await web3_http.eth.getGasPrice();
        const gasFeesWei = gasPrice * BigInt(21000n);
        const balanceWei = BigInt(balance);
        const amountToSendWei = balanceWei - gasFeesWei;

        if (amountToSendWei <= BigInt(0)) {
            const response = {
                status: false,
                status_code: 400,
                message: 'Insufficient balance to cover gas fees.',
                error: { 'amountToSendWei': amountToSendWei }
            };

            convertBigIntToInt(response);
            return res.status(400).send(response);
        }

        const centralAddress = MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS;

        const txObject = {
            to: centralAddress,
            value: amountToSendWei.toString(),
            gas: '0x5208',
            gasPrice: gasPrice.toString(),
            nonce: await web3_http.eth.getTransactionCount(fromAddress),
        };

        const signedTx = await web3_http.eth.accounts.signTransaction(txObject, privateKey);
        const receipt = await web3_http.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log('Transaction receipt:', receipt);

        function convertBigIntToInt(obj) {
            for (const key in obj) {
                if (typeof obj[key] === 'bigint') {
                    obj[key] = Number(obj[key]);
                } else if (typeof obj[key] === 'object') {
                    convertBigIntToInt(obj[key]);
                }
            }
        }

        convertBigIntToInt(receipt);
        
        let centralAddressLastBlockNumberUserMetaResponse, centralAddressLastBlockNumberUserMetaResponseDisplay;     
        if (receipt.status === 1 && receipt.transactionHash) {

             // Call the first endpoint to update centralAddressLastBlockNumberUserMetaRequestBody
             try {

                    const centralAddressLastBlockNumberUserMetaRequestBody = {
                        [`${userAddress}_central_address_withdrawal_last_block_number_bnb`]: receipt.blockNumber
                    };
                    centralAddressLastBlockNumberUserMetaResponse = await axios.put(`${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/${user_id}`, centralAddressLastBlockNumberUserMetaRequestBody, {
                        headers: {
                            'x-api-key': MODULE1_BASE_API_KEY
                        }
                    });
                    centralAddressLastBlockNumberUserMetaResponseDisplay = centralAddressLastBlockNumberUserMetaResponse.data;
             } catch (error) {
                    // Handle error as needed
                    console.error('Error in centralAddressLastBlockNumberUserMetaResponse request:', error);
                    if (error.response && error.response.data) {
                        centralAddressLastBlockNumberUserMetaResponseDisplay = error.response.data;
                    } else {
                        centralAddressLastBlockNumberUserMetaResponseDisplay = error;
                    }

             }

            // Dynamically retrieve the base URL
            const baseURL = `${req.protocol}://${req.get('host')}`;
            //const webhookURL = 'https://webhook.site/564cc5dd-03c2-42b1-b1e8-046c030dbdd2'; // Test webhook URL
            const webhookURL = `${baseURL}/cryptocurrency/bscscan/bnb/actions-after-central-address-withdrawal/push-transactions/address/${userAddress}` // Your webhook URL
            //await axios.get(webhookURL, { data: receipt });
        }

        const response = {
            status: true,
            status_code: 200,
            message: "Withdrawal to Central Wallet Successful",
            data: {
                receipt:receipt,
                centralAddressLastBlockNumberUserMetaResponse: centralAddressLastBlockNumberUserMetaResponseDisplay
                }
        };
        res.send(response);

    } catch (error) {
        console.error('Error:', error);

        const response = {
            status: false,
            status_code: 400,
            message: error.message || "Internal Error",
            error: error
        };

        res.status(400).send(response);
    }

});


router.get('/:userID/:userAddress', async function(req, res, next) {
    // Set the content type to JSON
    res.setHeader('Content-Type', 'application/json');

    const user_id = req.params.userID;
    const user_address = req.params.userAddress.toLowerCase();
    const contract_address = req.query.contract_address || '';

    try {
    
        if(!user_id){
            throw new Error(`user_id not specified`);
        }

        if(!user_address){
            throw new Error(`user_address not specified`);
        }

        if(!contract_address){
            throw new Error(`contract_address not specified`);
        }
        
        // Withdraw Token from appUserAddress
        const response = await withdrawUserBEP20toCentralAddress(user_id, user_address, contract_address);

        return res.status(response.status_code).send(response)

    } catch (error) {
        // Handle errors using custom error handling middleware
        handleTryCatchError(res, error);
    }
});



// Subscribe to BNB transfer events for the provided address
router.get('/monitor-for-transactions/:address', async function (req, res, next) {
    try {
        const address = req.params.address.toLowerCase();

        const subscription = await web3_wss.eth.subscribe('pendingTransactions', {
            address: address,
        });

        subscription.on('data', async log => {
            console.log(`New BNB transfer detected for address ${address}`);
            console.log(log);
        });

        subscription.on('error', error =>
            console.log('Error when subscribing to BNB transfers: ', error),
        );

        res.status(200).send({ status: true, message: 'Monitoring started for address ' + address });

    } catch (error) {
        console.error('Error:', error);
        res.status(400).send({ status: false, message: error.message || "Internal Error" });
    }
});


module.exports = router; 

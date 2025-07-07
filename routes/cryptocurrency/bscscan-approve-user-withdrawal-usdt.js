const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const { Web3 } = require('web3');
const { toWei } = require('web3-utils');
const router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Import middleware / utils
const userWalletBalanceCheck = require('../../middleware-utils/user-wallet-balance-check');
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');

// Import the approveWithdrawalTransaction function 
const { approveWithdrawalTransaction } = require('../withdrawal/utils');

// Initialize ENV 
const MODULE1_BASE_URL = process.env.MODULE1_BASE_URL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_BASE_ALLOWED_WITHDRAWAL_WALLET_ID = process.env.MODULE1_BASE_ALLOWED_WITHDRAWAL_WALLET_ID;

const MODULE1_CRYPTOCURRENCY_MNEMONIC = process.env.MODULE1_CRYPTOCURRENCY_MNEMONIC;
const MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL = process.env.MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL;
const MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY || 'YourApiKey';
const MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK.toLowerCase();
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET;
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET;
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET;
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET;


const MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS = process.env.MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS.toLowerCase();
const MODULE1_CRYPTOCURRENCY_WITHDRAWAL_ADDRESS_FROM_PRIVATE_KEY = process.env.MODULE1_CRYPTOCURRENCY_WITHDRAWAL_ADDRESS_FROM_PRIVATE_KEY;
const MODULE1_CRYPTOCURRENCY_WITHDRAWAL_ADDRESS_FROM = process.env.MODULE1_CRYPTOCURRENCY_WITHDRAWAL_ADDRESS_FROM;


let web3_http, web3_wss, abiFilePathtoABI, contractAddress;
try {
    if (MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK === "testnet") {

        web3_http = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET}`);
        web3_wss = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET}`);
        abiFilePathtoABI = path.join(__dirname, 'contract-abi', 'bscscan-testnet', 'usdt_abi.json');
        contractAddress = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'; // USDT contract address on BSC Testnet


    } else {

        web3_http = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET}`);
        web3_wss = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET}`);
        abiFilePathtoABI = path.join(__dirname, 'contract-abi', 'bscscan-mainnet', 'usdt_abi.json');
        contractAddress = '0x55d398326f99059fF775485246999027B3197955'; // USDT contract address on BSC Mainnet

    }
} catch (error) { 
    console.error("Error occurred while initializing ENV providers:", error.message);
    // Handle the error as needed, for example, by providing a default value or exiting the program
}


router.put('/approve/:transactionID', async function(req, res, next) {
    try {

        //Function to serialize BigInt
        function convertBigIntToInt(obj) {
            for (const key in obj) {
                if (typeof obj[key] === 'bigint') {
                    obj[key] = Number(obj[key]);
                } else if (typeof obj[key] === 'object') {
                    convertBigIntToInt(obj[key]);
                }
            }
        }
       
        // Extracting data from the request url
        const transactionID = req.params.transactionID;
        
        // Extracting data from the request body
        const { user_id_performing_request, user_id, meta_data } = req.body;

        // Step: Check if User Transaction ID is admin_pending 
        const transactionDetailsUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${transactionID}`;

        const transactionDetailsResponse = await axios.get(transactionDetailsUrl, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
               // 'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        const transaction_request_withdrawal_address_to = transactionDetailsResponse.data.data.transaction_request_withdrawal_address_to;
        if (!transaction_request_withdrawal_address_to) {
            // Return error response if pending transaction exists
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Withdrawal Address to was not set",
                error: {
                    message: `Withdrawal Address to was not set`,
                    recommendation: "Set Withdrawal Address to",
                    error_data: transaction_request_withdrawal_address_to
                }
            });
        }

        const amount = transactionDetailsResponse.data.data.amount;
        if (!amount || amount<=0) {
            // Return error response if pending transaction exists
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Invalid Amount, amount less than or equal to 0",
                error: {
                    message: `Invalid Amount, amount less than or equal to 0`,
                    recommendation: "Amount should be positve",
                    error_data: amount
                }
            });
        }


        const wallet_id = transactionDetailsResponse.data.data.currency;
        if (!wallet_id || wallet_id!="usdt") {
            // Return error response if pending transaction exists
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Invalid wallet_id",
                error: {
                    message: `Invalid wallet_id specifed`,
                    recommendation: "wallet_id should be usdt",
                    error_data: wallet_id
                }
            });
        }



        const privateKey = MODULE1_CRYPTOCURRENCY_WITHDRAWAL_ADDRESS_FROM_PRIVATE_KEY ;
        const fromAddress = MODULE1_CRYPTOCURRENCY_WITHDRAWAL_ADDRESS_FROM ;
        const toAddress = transaction_request_withdrawal_address_to;

        const amountInWei = web3_http.utils.toWei(amount, 'ether'); // Convert to smallest unit (wei)

        const gasPrice = await web3_http.eth.getGasPrice();
        const gasFeesWei = gasPrice * BigInt(21000n);

        const bnbBalance = await web3_http.eth.getBalance(fromAddress);
        const bnbBalanceInEther = web3_http.utils.fromWei(bnbBalance, 'ether');
        const bnbBalanceWei = BigInt(bnbBalance);

        if (bnbBalanceWei < gasFeesWei) {
            const response = {
                status: false,
                status_code: 400,
                message: 'User has insufficient BNB balance for GAS Fee',
                error: { "bnbBalanceInEther" : bnbBalanceInEther,
                         "bnbBalanceWei" : bnbBalanceWei
                        }
            };

            convertBigIntToInt(response);
            return res.status(400).send(response);
        }

        const usdtContractAddress = contractAddress; // USDT contract address
        
        const usdtAbi = await getUSDTAbi();
        const usdtContract = new web3_http.eth.Contract(usdtAbi, usdtContractAddress);

        const balanceResponse = await usdtContract.methods.balanceOf(fromAddress).call();
        const balanceInWei = balanceResponse;

        if (balanceInWei < amountInWei) {
            const response = {
                status: false,
                status_code: 400,
                message: 'Insufficient USDT balance',
                error: { 
                        "amount" : amount,
                        "amountInWei" : amountInWei,
                        "balanceInWei" : balanceInWei,
                        }
            };

            convertBigIntToInt(response);
            return res.status(400).send(response);
        }


        const approvalResult = await approveWithdrawalTransaction(transactionID, user_id, meta_data);

        if(approvalResult.status!=true){
            return res.status(400).send(approvalResult);
        }


        const gasLimit = '500000'; // Gas limit for the transaction

        const data = usdtContract.methods.transfer(toAddress, amountInWei).encodeABI();
        const nonce = await web3_http.eth.getTransactionCount(fromAddress);

        const txObject = {
            from: fromAddress,
            to: usdtContractAddress,
            gas: gasLimit,
            gasPrice: gasPrice,
            data: data,
            nonce: nonce
        };

        const signedTx = await web3_http.eth.accounts.signTransaction(txObject, privateKey);
        const receipt = await web3_http.eth.sendSignedTransaction(signedTx.rawTransaction);
        convertBigIntToInt(receipt);
        
        const transaction_withdrawal_payment_from_addres = receipt.from;
        const transaction_hash = receipt.transactionHash;
        const block_number = receipt.blockNumber;

        const updateTransactionUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${transactionID}`;
        const updateTransactionRequestBody = {
            ...meta_data,
            "transaction_hash": transaction_hash,
            "blockchain_withdrawal_transaction_hash": transaction_hash,
            "blockchain_withdrawal_block_number": block_number,
            "blockchain_withdrawal_payment_from_address": transaction_withdrawal_payment_from_addres,
            "transaction_withdrawal_external_processor": 'bscscan.com'
        };


        const updateTransactionResponse = await axios.put(updateTransactionUrl, updateTransactionRequestBody, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
             // 'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        let response = {
            status: true,
            status_code: 200,
            message: "Transaction Approved Successfully",
            data: {
                approval_result : approvalResult,
                receipt : receipt,
                update_transaction_response : updateTransactionResponse.data
            }
        };
        
        //convertBigIntToInt(response);

        return res.json(response);

    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }


});

async function getUSDTAbi() {
    try {
        // Specify the relative path to the ABI file
        const abiFilePath = abiFilePathtoABI;
               
        // Read the ABI from the file
        const abiData = await fs.readFile(abiFilePath, 'utf-8');

        // Parse the JSON data to get the ABI
        const abi = JSON.parse(abiData);

        return abi;
    } catch (error) {
        console.error('Error reading ABI file:', error);
        throw error; // Throw error for handling at higher level
    }
}


module.exports = router;

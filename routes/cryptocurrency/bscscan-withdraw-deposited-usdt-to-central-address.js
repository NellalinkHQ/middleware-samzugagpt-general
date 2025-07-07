const express = require('express');
const axios = require('axios');
const { Web3 } = require('web3');
const router = express.Router();
const MODULE1_CRYPTOCURRENCY_MNEMONIC = process.env.MODULE1_CRYPTOCURRENCY_MNEMONIC;
const MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL = process.env.MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY || 'YourApiKey';
const MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK.toLowerCase() ;
const MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS = process.env.MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS.toLowerCase() ;


// Initialize Web3 with BSC endpoint
const web3 = new Web3('https://data-seed-prebsc-1-s1.binance.org:8545');

// USDT Contract Address on BSC testnet
const usdtContractAddress = '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd';

// Account details
const fromAddress = '0x16D9038c9fF1Cb0f2a94d313246e10c0d2128e5C'.toLowerCase(); // Replace with your sender address
const privateKey = '7d3f5195254f1296fe0fc8c21614f85ec02206eaa4091b57e0eaf4368fcb4624'; // Replace with your private key

/* Withdraw USDT from user's address to central address */
router.get('/:userAddress', async function(req, res, next) {
    try {
        const userAddress = req.params.userAddress.toLowerCase();

        // Get the user's USDT balance
        const balance = await web3.eth.call({
            to: usdtContractAddress,
            data: web3.eth.abi.encodeFunctionCall({
                name: 'balanceOf',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: 'account'
                }]
            }, [userAddress])
        });

        const balanceInWei = web3.utils.toWei(balance, 'wei');
        const balanceInUSDT = web3.utils.fromWei(balanceInWei, 'ether');

        if (balanceInUSDT <= 0) {
            return res.status(400).json({ success: false, message: 'User has insufficient USDT balance.' });
        }

        // Withdraw USDT from user's address to central address
        const centralAddress = '0xFdf18b64946d8C865b356B8a5d5dCAa01B1D68e9'.toLowerCase();
        const transferData = web3.eth.abi.encodeFunctionCall({
            name: 'transfer',
            type: 'function',
            inputs: [{
                type: 'address',
                name: 'recipient'
            }, {
                type: 'uint256',
                name: 'amount'
            }]
        }, [centralAddress, balanceInWei]);

        // Get the gas estimate for the transaction
        const gas = await web3.eth.estimateGas({
            to: usdtContractAddress,
            data: transferData
        });

        // Sign the transaction locally
        const tx = {
            to: usdtContractAddress,
            from: fromAddress,
            gas: gas,
            data: transferData
        };
        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);

        // Send the signed transaction
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log('Transaction receipt:', receipt);

        const response = {
            status: true,
            status_code: 200,
            message: "Withdrawal successful.",
            data: receipt // Transaction receipt
        };
        res.send(response);
        
    } catch (error) {
        console.error('Error:', error);

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

        res.status(400).send(response);
    }
});

module.exports = router;

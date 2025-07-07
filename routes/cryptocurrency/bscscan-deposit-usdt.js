const express = require('express');
const axios = require('axios');
const { Web3 } = require('web3');
const router = express.Router();


const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET;

// Initialize Web3 with WSC endpoint
const web3 = new Web3(MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET);

// USDT Contract Address on BSC
const usdtContractAddress = '0x55d398326f99059ff775485246999027b3197955';

/* Subscribe to the address for monitoring */
router.get('/:address', async function(req, res, next) {
    try {
        // Extracting address from the url req params
        let address = req.params.address.toLowerCase(); // Ensure address is lowercase
        if (address.startsWith('0x')) {
            address = address.slice(2); // Remove '0x' prefix
        }

        // Pad the address to 64 characters
        const paddedAddress = address.padStart(64, '0');

        // Construct the topic for USDT transfers for the provided address
        const topic = '0xa9059cbb' + paddedAddress;

        console.log('Constructed topic:', topic); // Log the constructed topic

        // Subscribe to USDT transfers for the provided address
        const subscription = await web3.eth.subscribe('logs', {
            address: usdtContractAddress,
            topics: [topic] // USDT Transfer topic
        });

        // Handle new log entries
        subscription.on('data', async log => {
            console.log(`New USDT transfer detected for address ${address}`);
            console.log(log);
            // You can send real-time updates to another endpoint or process the data here
        });

        // Handle subscription errors
        subscription.on('error', error =>
            console.log('Error when subscribing to USDT transfers: ', error),
        );
        
        // Respond with success
        res.status(200).send({ status: true, message: 'Monitoring started for address ' + address });
    
    } catch (error) {
        console.error('Error:', error);
        res.status(400).send({ status: false, message: error.message || "Internal Error" });
    }
});

module.exports = router;

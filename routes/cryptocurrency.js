const express = require('express');
const axios = require('axios');
const router = express.Router();

// Retrieve API key from environment variable
const apiKey = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY || 'YourApiKey';
// Retrieve central address from environment variable
const centralAddress = process.env.MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS;

// Function to fetch transaction details by hash
async function fetchTransactionDetails(txHash) {
    try {
        const apiUrl = `https://api.bscscan.com/api?module=transaction&action=gettxreceiptstatus&txhash=${txHash}&apikey=${apiKey}`;
        console.log('apiURL:', apiUrl);

        const response = await axios.get(apiUrl);
        
        if (response.data.status === '1' && response.data.message === 'OK') {
            const result = response.data.result;

            // Check if the transaction is successful
            if (result.status === '1') {
                return { status: result.status };
            } else {
                console.error('Transaction failed or does not exist.');
                return null;
            }
        } else {
            console.error('Failed to fetch transaction details:', response.data.message);
            return null;
        }
    } catch (error) {
        console.error('Error fetching transaction details:', error.message);
        return null;
    }
}

// Function to fetch transaction list by address
async function fetchListTransactions(address) {
    try {
        const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=0x55d398326f99059fF775485246999027B3197955&address=${address}&page=1&offset=20&startblock=0&endblock=999999999&sort=desc&apikey=${apiKey}`;
        console.log('apiURL:', apiUrl);

        const response = await axios.get(apiUrl);
        
        if (response.data.status === '1') {
            const result = response.data.result;

            // Format amount to be human-readable
            const transactions = result.map(transaction => {
                const amount_value_readable = parseFloat(transaction.value) / Math.pow(10, 18); // Convert from wei to BNB
                const transaction_to_central_address = transaction.to === centralAddress.toLowerCase() ? 'yes' : 'no';
                const admin_can_push_this_transaction = transaction.to !== centralAddress.toLowerCase();
                
                // Create the base transaction object
                let mappedTransaction = {
                    ...transaction,
                    amount_value_readable,
                    transaction_to_central_address,
                    admin_can_push_this_transaction
                };

                // Conditionally add additional properties if admin_can_push_this_transaction is true
                if (admin_can_push_this_transaction) {
                    mappedTransaction = {
                        ...mappedTransaction,
                        request_id: transaction.hash,
                        amount: parseFloat(transaction.value) / Math.pow(10, 18),
                        wallet_id: 'usdt',
                        note: 'Deposit Received - ' + transaction.hash
                    };
                }

                return mappedTransaction;
            });

            return transactions;
        } else {
            console.error('Failed to fetch transaction details:', response.data.message);
            return null;
        }
    } catch (error) {
        console.error('Error fetching transaction details:', error.message);
        return null;
    }
}

// Get BSCScan Transaction Info by transaction hash
router.get('/bscscan-tx-info/:txHash', async function(req, res, next) {
    const txHash = req.params.txHash;

    try {
        const transaction = await fetchTransactionDetails(txHash);

        if (transaction) {
            //console.log('Transaction Details:', transaction);
            res.status(200).json({
                status: true,
                status_code: 200,
                message: "Transaction details retrieved",
                data: transaction
            });
        } else {
            console.log('Transaction details not found or failed.');
            res.status(404).json({
                status: false,
                status_code: 404,
                message: "Transaction details not found or failed"
            });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(400).json({
            status: false,
            status_code: 400,
            message: "Internal Error"
        });
    }
});

// Get BSCScan Transaction Lists by address
router.get('/bscscan-transactions/usdt/address/:address', async function(req, res, next) {
    const address = req.params.address;

    try {
        const transactionLists = await fetchListTransactions(address);

        if (transactionLists) {
            console.log('Transaction Lists:', transactionLists);
            res.status(200).json({
                status: true,
                status_code: 200,
                message: "Transaction Lists Retrieved",
                data: transactionLists
            });
        } else {
            console.log('Transactions Lists not found or failed.');
            res.status(404).json({
                status: false,
                status_code: 404,
                message: "Transactions Lists not found or failed"
            });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(400).json({
            status: false,
            status_code: 400,
            message: "Internal Error"
        });
    }
});

// GET Staking listing
router.get('/', function(req, res, next) {
    let messages = {
        1: {
            id: '1',
            text: 'Hello World',
            userId: '1',
        },
        2: {
            id: '2',
            text: 'By World',
            userId: '2',
        },
    };
    res.send(messages);
});

module.exports = router

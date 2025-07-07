const express = require('express');
const axios = require('axios');
const router = express.Router();

const MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL = process.env.MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY || 'YourApiKey';
const MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK.toLowerCase() ;
const MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS = process.env.MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS.toLowerCase() ;

const BSCSCAN_WALLET_ID = 'bnb';

// Push BSCScan Transaction by address
router.get('/push-transactions/address/:address', async function(req, res, next) {
    const address = req.params.address;

    try {
        const transactionLists = await fetchListTransactionsBNB(address, 5, 1,true);

        transactionLists.sort((a, b) => a.blockNumber - b.blockNumber); // sort the list so it is asc order

        let lastPushedTransactionBlockNumber; // Declare the variable here
        let appUserID;
        if (transactionLists) {
            // Loop through transactionLists
            for (const transaction of transactionLists) {
                // Step: Credit user
                const creditUrl = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/rimplenet/v1/credits`;

                // Send the credit request to the backend only if middleware_can_push_this_transaction is true
                if (transaction.middleware_can_push_this_transaction === true) {

                    let appAddressLastBlockNumberUserMetaResponse, appAddressLastBlockNumberUserMetaResponseDisplay;
                    let appCreditResponseData;
                    try {
                        // Send the credit request to the backend
                        const creditResponse = await axios.post(creditUrl, {
                            request_id: transaction.request_id,
                            user_id: transaction.user_id,
                            wallet_id: transaction.wallet_id,
                            amount: transaction.amount,
                            note: transaction.note
                        }, {
                            headers: {
                                'x-api-key': MODULE1_BASE_API_KEY
                            }
                        });
                        appCreditResponseData = creditResponse.data;
                    } catch (error) {
                        if (error.response && error.response.status === 409) {
                            appCreditResponseData = error.response.data;
                        } else {
                            throw error; // Throw other errors to be caught by the outer catch block
                        }
                    }

                    lastPushedTransactionBlockNumber = parseInt(transaction.blockNumber);
                    appUserID = transaction.user_id;
                    // Append Credit response data to the transaction
                    transaction.appCreditResponseData = appCreditResponseData;
                }
                
            }

            try {
                const appAddressLastBlockNumberUserMetaRequestBody = {
                    [`${address}_app_address_deposit_last_block_number_bnb`]: lastPushedTransactionBlockNumber
                };
                appAddressLastBlockNumberUserMetaResponse = await axios.put(`${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/${appUserID}`, appAddressLastBlockNumberUserMetaRequestBody, {
                    headers: {
                        'x-api-key': MODULE1_BASE_API_KEY
                    }
                });
                appAddressLastBlockNumberUserMetaResponseDisplay = appAddressLastBlockNumberUserMetaResponse.data;
            } catch (error) {
                // Handle error as needed
                console.error('Error in userAddressLastBlockNumberUserMetaResponse request:', error);
                if (error.response && error.response.data) {
                    appAddressLastBlockNumberUserMetaResponseDisplay = error.response.data;
                } else {
                    appAddressLastBlockNumberUserMetaResponseDisplay = error;
                }
            }

            //console.log('Transactions Pushed:', transactionLists);
            //console.log('appAddressLastBlockNumberUserMetaResponseDisplay:', `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/${appUserID}`);

            res.status(200).json({
                status: true,
                status_code: 200,
                message: "Transactions Pushed Successfully",
                data: {
                    transactionLists: transactionLists,
                    appAddressLastBlockNumberUserMetaResponse: appAddressLastBlockNumberUserMetaResponseDisplay
                }
            });

        } else {
            console.log('Transaction not found.');
            res.status(404).json({
                status: false,
                status_code: 404,
                message: "Transaction not found"
            });
        }
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



// Get BSCScan Transaction Lists by address
router.get('/list-transactions/address/:address', async function(req, res, next) {
    const address = req.params.address;
    let per_page = parseInt(req.query.per_page) || 20; // Default per_page to 20 if not provided or not a valid integer
    let page_no = parseInt(req.query.page_no) || 1; // Default page_no to 1 if not provided or not a valid integer
    let order = req.query.order || "desc"; // Default order to "desc" if not provided or not valid

    // Ensure per_page, page_no, and order are positive integers and valid order values
    per_page = per_page > 0 ? per_page : 20;
    page_no = page_no > 0 ? page_no : 1;
    order = order === "asc" || order === "desc" ? order : "desc";

    try {
        let transactionLists = await fetchListTransactionsBNB(address);

        // Sort transactions based on block number
        if (order === "asc") {
            transactionLists.sort((a, b) => a.blockNumber - b.blockNumber);
        } else {
            transactionLists.sort((a, b) => b.blockNumber - a.blockNumber);
        }

        // Paginate the sorted transaction lists
        const startIndex = (page_no - 1) * per_page;
        const endIndex = startIndex + per_page;
        const sortedAndPaginatedLists = transactionLists.slice(startIndex, endIndex);

        if (transactionLists) {
            console.log('Transaction Lists:', sortedAndPaginatedLists);
            res.status(200).json({
                status: true,
                status_code: 200,
                message: "Transaction Lists Retrieved",
                data: sortedAndPaginatedLists
            });
        } else {
            console.log('Transactions Lists not found or failed.');
            res.status(400).json({
                status: false,
                status_code: 400,
                message: "Error Encountered",
                data: sortedAndPaginatedLists
            });
        }
    } catch (error) {
        let error_info;
        let error_status_code = 400;
        if (error.response && error.response.data) {
            error_info = error.response.data;
            error_status_code = error.response.data.status_code || 400;
        } else {
            error_info = error;
        }

        const response = {
            status: false,
            status_code: error_status_code,
            message: error.message || "Internal Error",
            error: error_info
        };

        console.error('Error:', error_info);
        res.status(error_status_code).send(response);
    }
});

// Function to fetch transaction list by address
async function fetchListTransactionsBNB(address, per_page = 20, page_no = 1, retrieve_non_processed_block = false) { //Many
    // Parse per_page and page_no to integers
    per_page = parseInt(per_page);
    page_no = parseInt(page_no);
    try {
        const userMetaUrl1 = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/utils/check-if-meta-value-exists?meta_key=eth_crypto_wallet_deposit_address&meta_value=${address}`;
        const userMetaUrlResponse1 = await axios.get(userMetaUrl1);

        if (!userMetaUrlResponse1.data.data.eth_crypto_wallet_deposit_address.meta_value === address) {
            const response = {
                status: false,
                status_code: 404,
                message: `Address ${address} does not exist in the app`
            };
            throw new Error(JSON.stringify(response));
        }

        let userMetaID = userMetaUrlResponse1.data.data.eth_crypto_wallet_deposit_address.user_id || 0;

        const address_lowercase = address.toLowerCase(); 
       

        let startBlock, endBlock;
        if(retrieve_non_processed_block){
            //Prepare and retrieve block number
            const central_address_withdrawal_last_block_number = `${address_lowercase}_central_address_withdrawal_last_block_number_bnb`;
            const app_address_deposit_last_block_number = `${address_lowercase}_app_address_deposit_last_block_number_bnb`;

            const userMetaUrl2 = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/${userMetaID}?meta_key=eth_crypto_wallet_deposit_address,${central_address_withdrawal_last_block_number},${app_address_deposit_last_block_number}`;
            const userMetaUrlResponse2 = await axios.get(userMetaUrl2);

            // Dynamically access startBlock and endBlock based on the address
            const startBlockKey  = `${address_lowercase}_app_address_deposit_last_block_number_bnb`;
            const endBlockKey = `${address_lowercase}_central_address_withdrawal_last_block_number_bnb`;

            // Set default values if startBlockKey or endBlockKey are not found
            startBlock = userMetaUrlResponse2.data.data[startBlockKey] || 0;
            endBlock = userMetaUrlResponse2.data.data[endBlockKey] || 999999999;
        }
        else{
            // Retrieve from start to latest
            startBlock =  0;
            endBlock = 999999999;
        }
         
        console.log("Start Block", startBlock);
        console.log("End Block", endBlock);

        let apiUrl;
        if(MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK==="testnet"){
            apiUrl = `https://api-testnet.bscscan.com/api?module=account&action=txlist&address=${address}&page=${page_no}&offset=${per_page}&startblock=${startBlock}&endblock=${endBlock}&sort=desc&apikey=${MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY}`;
        
        }else{
            apiUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${address}&page=${page_no}&offset=${per_page}&startblock=${startBlock}&endblock=${endBlock}&sort=desc&apikey=${MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY}`;
           
        }

        //console.log('apiURL:', apiUrl);

        const response = await axios.get(apiUrl);

        if (response.data.status === '1') {
            const result = response.data.result;

            let WithdrawnToCentralAddressBlocknumber;
            // loop through the transactions
            const transactions = result.map(transaction => {
                const amount_value_readable = parseFloat(transaction.value) / Math.pow(10, 18); // Convert from wei to BNB
                let transaction_to_central_address;

                if (transaction.to === MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS) {
                    transaction_to_central_address = 'yes';
                } else if (transaction.to !== address && transaction.to !== MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS) {
                    transaction_to_central_address = 'unknown';
                } else if (transaction.to === address) {
                    transaction_to_central_address = 'no';
                } else {
                    transaction_to_central_address = 'unknown';
                }

                if(transaction_to_central_address==="yes"){
                  WithdrawnToCentralAddressBlocknumber = parseInt(transaction.blockNumber);
                }

                // Set transaction_to_app_wallet_address to 'yes' if transaction.to is equal to user address
                const transaction_to_app_wallet_address = transaction.to === address ? 'yes' : 'no';

                let admin_can_push_this_transaction = false;
                let middleware_can_push_this_transaction = false;
                let user_can_push_this_transaction = false;

                // Set admin_can_push_this_transaction only if transaction_to_app_wallet_address is 'yes'
                if (transaction_to_app_wallet_address === 'yes') {
                    admin_can_push_this_transaction = true;
                }
                // Set middleware_can_push_this_transaction only if transaction_to_app_wallet_address is 'yes' txn blocknumber is less than less than WithdrawnToCentralAddressBlocknumber
                let thisTxnBlockNumber = parseInt(transaction.blockNumber);
                if (transaction_to_app_wallet_address === 'yes' && thisTxnBlockNumber<WithdrawnToCentralAddressBlocknumber) {
                    middleware_can_push_this_transaction = true; 
                    user_can_push_this_transaction = true;
                }


                // Create the base transaction object
                let mappedTransaction = {
                    ...transaction,
                    amount_value_readable,
                    transaction_to_central_address,
                    transaction_to_app_wallet_address,
                    admin_can_push_this_transaction,
                    middleware_can_push_this_transaction,
                    user_can_push_this_transaction
                };

                // Conditionally add additional properties if admin_can_push_this_transaction or middleware_can_push_this_transaction is true
                if (admin_can_push_this_transaction || middleware_can_push_this_transaction) {
                    mappedTransaction = {
                        ...mappedTransaction,
                        request_id: transaction.hash,
                        user_id: userMetaID,
                        wallet_id: 'bnb',
                        amount: parseFloat(transaction.value) / Math.pow(10, 18),
                        note: 'Deposit Received - ' + transaction.hash
                    };
                }

                return mappedTransaction;
            });

            return transactions;
        } else {
            console.error('Transaction lists not found:', response.data.message);
            const error = new Error(response.data.message);
            error.status_code = 404;
            throw error;
        }
    } catch (error) {
        throw error;
    }
}



// Function to fetch transaction list by address
async function fetchListTransactionsUSDT(address) { //Many
    try {
        const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=0x55d398326f99059fF775485246999027B3197955&address=${address}&page=1&offset=20&startblock=0&endblock=999999999&sort=desc&apikey=${MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY}`;
        console.log('apiURL:', apiUrl);

        const response = await axios.get(apiUrl);
        
        if (response.data.status === '1') {
            const result = response.data.result;

            // Format amount to be human-readable
            const transactions = result.map(transaction => {
                const amount_value_readable = parseFloat(transaction.value) / Math.pow(10, 18); // Convert from wei to BNB
                const transaction_to_central_address = transaction.to === MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS? 'yes' : 'no';
                const admin_can_push_this_transaction = transaction.to !== MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS;
                const middleware_can_push_this_transaction = transaction.to !== MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS;
                
                // Create the base transaction object
                let mappedTransaction = {
                    ...transaction,
                    amount_value_readable,
                    transaction_to_central_address,
                    admin_can_push_this_transaction,
                    middleware_can_push_this_transaction
                };

                // Conditionally add additional properties if admin_can_push_this_transaction is true
                if (admin_can_push_this_transaction) {
                    mappedTransaction = {
                        ...mappedTransaction,
                        request_id: transaction.hash,
                        user_id: 1,
                        wallet_id: 'bnb',
                        amount: parseFloat(transaction.value) / Math.pow(10, 18),
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
}

// Function to fetch transaction details by hash
async function fetchTransactionDetails(txHash) { //Single
    try {
        const apiUrl = `https://api.bscscan.com/api?module=transaction&action=gettxreceiptstatus&txhash=${txHash}&apikey=${MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY}`;
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
}

// Get BSCScan Transaction Info by transaction hash
router.get('/tx-info/:txHash', async function(req, res, next) {
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


module.exports = router

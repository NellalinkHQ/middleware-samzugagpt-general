const express = require('express');
const axios = require('axios');
const { Web3 } = require('web3'); // Note: Web3 should be capitalized
const bip39 = require('bip39');
const hdkey = require("hdkey");
const ethUtil = require("ethereumjs-util");
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const MODULE1_CRYPTOCURRENCY_MNEMONIC = process.env.MODULE1_CRYPTOCURRENCY_MNEMONIC;
const MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL = process.env.MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;

const MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY || 'YourApiKey';
const MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK.toLowerCase();

const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET;
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET;
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET;
const MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET = process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET;

const MODULE1_CRYPTOCURRENCY_AIRDROP_FEE_PAYER_ADDRESS_PRIVATE_KEY = process.env.MODULE1_CRYPTOCURRENCY_AIRDROP_FEE_PAYER_ADDRESS_PRIVATE_KEY;
const MODULE1_CRYPTOCURRENCY_AIRDROP_FEE_PAYER_ADDRESS = process.env.MODULE1_CRYPTOCURRENCY_AIRDROP_FEE_PAYER_ADDRESS.toLowerCase();
const MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS = process.env.MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS.toLowerCase();


//const MODULE1_CRYPTOCURRENCY_ALLOWED_BEP20_CONTRACT_ADDRESS = process.env.MODULE1_CRYPTOCURRENCY_ALLOWED_BEP20_CONTRACT_ADDRESS.toLowerCase();
// const MODULE1_CRYPTOCURRENCY_ALLOWED_BEP20_CONTRACT_ADDRESS  = [{
//             "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd": {
//                 "token_name": "Tether USDT",
//                 "token_symbol": "USDT",
//                 "token_decimal": 18,
//                 "rimplenet_backend_minimum_amount_to_process_deposit_per_request": 10,
//                 "rimplenet_backend_maximum_amount_to_process_deposit_per_request": 100,
//                 "rimplenet_backend_wallet_id_to_deposit_to_user_wallet": "usdt"
//             },
//             "0x24a7fa01ab2a327398f170076a1c2029e50d293b": {
//                 "token_name": "Hycacoin",
//                 "token_symbol": "HCC",
//                 "token_decimal": 8,
//                 "rimplenet_backend_minimum_amount_to_process_deposit_per_request": 10,
//                 "rimplenet_backend_maximum_amount_to_process_deposit_per_request": 100,
//                 "rimplenet_backend_wallet_id_to_deposit_to_user_wallet": "ngn"
//             }
//         }];

const contract_deposit_filename = process.env.MODULE1_CRYPTOCURRENCY_ALLOWED_BEP20_DEPOSIT_CONTRACTS_FILENAME;
        
const MODULE1_CRYPTOCURRENCY_ALLOWED_BEP20_CONTRACT_ADDRESS = getAllowedDepositContract(contract_deposit_filename);

// Initialize Web3 with BSC testnet and mainnet endpoints
let web3_http, web3_wss;
if (MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK === "testnet") {
    web3_http = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET}`);
    web3_wss = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET}`);
} else {
    web3_http = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET}`);
    //web3_wss = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET}`);
}

 async function withdrawUserBNBtoCentralAddress(user_id, from_address){
    try {
        // Define central address for withdrawal
        const centralAddress = MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS;

        // Retrieve user address from the request params and convert to lowercase
        const userAddress = from_address.toLowerCase();

        const address_meta = await getAddressMetaData(user_id, "yes");
        if (address_meta.data.address.toLowerCase() !== from_address.toLowerCase() ) {
                    let response =  {
                    status: false,
                    status_code: 400,
                    message: `User Provided Address and Address on file do not tally`,
                    error : {   user_address_provided_lowercase: from_address,
                                user_address_on_file_lowercase : address_meta.data.address}
                    };

            convertBigIntToInt(response);

            return response;
         }
        

        // Get user's balance in BNB
        const bnb_balance = await web3_http.eth.getBalance(userAddress);
        const bnb_balanceInEther = web3_http.utils.fromWei(bnb_balance, 'ether');

        // Check if user has zero BNB balance
        if (bnb_balanceInEther <= 0) {
            const response = {
                status: false,
                status_code: 400,
                message: 'From Address has zero BNB balance.',
                error: { 
                    from_address: from_address,
                    bnb_balance: bnb_balance,
                    bnb_balance_in_ether: bnb_balanceInEther
                }
            };
            convertBigIntToInt(response);
            return response;
        }

        const gasLimit = 21000;
        
        // Calculate gas fees and amount to send
        const gasPrice = BigInt(await web3_http.eth.getGasPrice()); // Convert gasPrice to BigInt
        const gasFeesWei = gasPrice * BigInt(gasLimit); // Calculate gas fees as BigInt
        const bnb_balance_in_wei = BigInt(bnb_balance);
        const amountToSendWei = bnb_balance_in_wei - gasFeesWei;

        // Check if there's sufficient balance to cover gas fees
        if (bnb_balance < gasFeesWei) {
            const response =  {
            status: false,
            status_code: 400,
            message: `From Address has BNB balance less than gas fee`,
            error : {   from_address: from_address,
                        bnb_balance_in_ether: bnb_balanceInEther,
                        bnb_balance: bnb_balance,
                        gas_fees_in_wei: gasFeesWei
                    }
            };


            convertBigIntToInt(response);
            return response;
        }

        
        // Construct transaction object
        const txObject = {
            to: centralAddress,
            value: amountToSendWei.toString(),
            gasLimit: gasLimit.toString(),
            gasPrice: gasPrice.toString(),
            nonce: await web3_http.eth.getTransactionCount(from_address),
        };

        const private_key = address_meta.data.private_key;
       

        // Sign the transaction
        const signedTx = await web3_http.eth.accounts.signTransaction(txObject, private_key);

        // Send the signed transaction
        const receipt_bnb_withdrawal = await web3_http.eth.sendSignedTransaction(signedTx.rawTransaction);
        // console.log('Transaction receipt:', receipt_bnb_withdrawal);
        
        // Push BNB to User Wallet 
        let pushBNBtoUserWalletResponseDiplay;
        try {
             pushBNBtoUserWalletResponseDiplay = await pushUserBNBTransactionstoUserWallet(user_id, from_address);

        } catch (error) {
            // Handle error as needed
            // console.error('Error in pushBNBtoUserWalletResponseD request:', error);
            if (error.response && error.response.data) {
                pushBNBtoUserWalletResponseDiplay = error.response.data;
            } else {
                pushBNBtoUserWalletResponseDiplay = error;
            }
        }
      
        // Construct response
        const response = {
            status: true,
            status_code: 200,
            message: 'BNB Withdrawal to Central Wallet Successful',
            data: {
                    'transaction_hash_bnb_withdrawal' : receipt_bnb_withdrawal.transactionHash,
                    'receipt_bnb_withdrawal' : receipt_bnb_withdrawal,
                    'push_bnb_to_user_wallet' : pushBNBtoUserWalletResponseDiplay
                 }
        };
        convertBigIntToInt(response);
        return response;
    } catch (error) {
        console.error('Error withdrawUserBNBtoCentralAddress:', error);
        throw error; // Throw error for handling at higher level
    }
}


async function pushUserBNBTransactionstoUserWallet(user_id, from_address) {

    try {

        // Sample data with allowed BEP20 contracted addresses

        const rimplenet_backend_wallet_id_to_deposit_to_user_wallet = "bnb";
       

        const address = from_address; // Assuming from_address is the address parameter
        const transactionListsRequest = await fetchListTransactionsBNB(from_address, 5, 1, true);
     
        let transactionLists;
        if (transactionListsRequest.status===true && transactionListsRequest.data.transactions) {
            transactionLists = transactionListsRequest.data.transactions;
        }
       
        if (transactionLists && transactionLists.length > 0) {
            transactionLists.sort((a, b) => a.blockNumber - b.blockNumber); // Sort the list in ascending order

            let lastPushedTransactionBlockNumber;

            for (const transaction of transactionLists) {
                const creditUrl = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/rimplenet/v1/credits`;

                if (transaction.middleware_can_push_this_transaction === true) {
                    let appCreditResponseData;

                    try {

                        if(MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK==="testnet"){
                            transaction_verification_url = `https://testnet.bscscan.com/tx/${transaction.request_id}`;
                        }else{
                            transaction_verification_url = `https://bscscan.com/tx/${transaction.request_id}`;
                        }
                        // Send credit request to the backend
                        const creditResponse = await axios.post(creditUrl, {
                            request_id: transaction.request_id,
                            user_id: transaction.user_id,
                            wallet_id: transaction.wallet_id,
                            amount: transaction.amount,
                            note: transaction.note,
                            meta_data : {

                                transaction_type_category : "deposits",
                                transaction_action_type : "blockchain_bscscan_deposit_bnb",
                                transaction_processor : "middleware",
                                transaction_external_processor : "bscscan",
                                transaction_verification_url : transaction_verification_url,
                                blockchain_processor_network : MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK,
                                blockchain_transaction_hash: transaction.hash,
                                blockchain_block_number: transaction.blockNumber,
                                blockchain_from_address: transaction.from,
                                blockchain_to_address: transaction.to,
                                blockchain_value: transaction.value
                            }
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
                    transaction.user_wallet_credit_response_data = appCreditResponseData; // Append credit response data
                }
            }

            if(!lastPushedTransactionBlockNumber){
                // Accessing the last object in the array
                const lastObject = transactionLists[transactionLists.length - 1];

                // Accessing the 'blockNumber' field of the last object
                lastPushedTransactionBlockNumber = parseInt(lastObject.blockNumber);

            }

            // Update user meta data with last pushed transaction block number
            const appAddressLastBlockNumberUserMetaUrl = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/${user_id}`;
            const appAddressLastBlockNumberUserMetaRequestBody = {
                [`${address}_app_address_deposit_last_block_number_bnb`]: lastPushedTransactionBlockNumber
            };
            const appAddressLastBlockNumberUserMetaResponse = await axios.put(
                appAddressLastBlockNumberUserMetaUrl,
                appAddressLastBlockNumberUserMetaRequestBody,
                {
                    headers: {
                        'x-api-key': MODULE1_BASE_API_KEY
                    }
                }
            );

            //  console.log("appAddressLastBlockNumberUserMetaUrl", appAddressLastBlockNumberUserMetaUrl);
            //  console.log("appAddressLastBlockNumberUserMetaRequestBody", appAddressLastBlockNumberUserMetaRequestBody);

            // Prepare response
            return {
                status: true,
                status_code: 200,
                message: "Transactions Pushed Successfully",
                data: {
                    transactions: transactionLists,
                    user_app_address_last_block_number_user_meta_response: appAddressLastBlockNumberUserMetaResponse.data
                }
            };
        } else {
            return {
                status: false,
                status_code: 404,
                message: "Transaction to Push not found"
            };
        }
    } catch (error) { 
        console.error('Error in pushUserBNBTransactionstoUserWallet:', error);
        throw error; // Throw error for handling at higher level
    }
}



// Function to fetch transaction list by address
async function fetchListTransactionsBNB(from_address, per_page = 20, page_no = 1, retrieve_non_processed_block = false) { //Many
    // Parse per_page and page_no to integers
    per_page = parseInt(per_page);
    page_no = parseInt(page_no);

    const address = from_address.toLowerCase(); // Convert from_address to lowercase

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
            endBlock = 'latest';
        }
        else{
            // Retrieve from start to latest
            startBlock =  0;
            endBlock = 'latest';
        }
         
        // console.log("Start Block BNB", startBlock);
        // console.log("End Block BNB", endBlock);

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

            return {
                status: true,
                status_code: 200,
                message: "Transactions Lists Retrieved Successfully",
                data : {transactions : transactions}
            };
        } else {
            return {
                status: false,
                status_code: 404,
                message: "Transaction not found"
            };
        }
    } catch (error) {
        console.error('Error fetchListTransactionsBNB:', error);
        throw error;
    }
}



async function withdrawUserBEP20toCentralAddress(user_id, from_address, contract_address) {
    try{

        const address_meta = await getAddressMetaData(user_id, "yes");
        if (address_meta.data.address.toLowerCase() != from_address.toLowerCase() ) {
                    let response =  {
                    status: false,
                    status_code: 400,
                    message: `User Provided Address and Address on file do not tally`,
                    error : {   user_address_provided_lowercase: from_address,
                                user_address_on_file_lowercase : address_meta.data.address}
                    };

            convertBigIntToInt(response);

            return response;
         }
        

            const tokenContractAbi = [
            {
                "constant": true,
                "inputs": [
                    {
                        "name": "_owner",
                        "type": "address"
                    }
                ],
                "name": "balanceOf",
                "outputs": [
                    {
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "payable": false,
                "stateMutability": "view",
                "type": "function"
            },
            {
                "constant": false,
                "inputs": [
                    {
                        "name": "_to",
                        "type": "address"
                    },
                    {
                        "name": "_value",
                        "type": "uint256"
                    }
                ],
                "name": "transfer",
                "outputs": [
                    {
                        "name": "",
                        "type": "bool"
                    }
                ],
                "payable": false,
                "stateMutability": "nonpayable",
                "type": "function"
            }
        ];
        const user_address = from_address;
        

        const tokenContractAddress = contract_address; // Token contract address on BSC 
        const tokenContract = new web3_http.eth.Contract(tokenContractAbi, tokenContractAddress);

        const central_address = MODULE1_CRYPTOCURRENCY_CENTRAL_WITHDRAWAL_TO_ADDRESS;
        const balanceResponse = await tokenContract.methods.balanceOf(user_address).call();
        const balanceInWei = balanceResponse;


        if (balanceInWei <= 0) {
            let response =  {
            status: false,
            status_code: 400,
            message: `User Address has zero token balance.`,
            error : {   balance_in_wei : balanceInWei,
                        user_address: user_address,
                        contract_address: contract_address
                    }
            };


            convertBigIntToInt(response);

            return response;
        }

        

        const gasLimit = 200000; // Gas limit for the transaction
        
        // Get the current gas price from the network
        const gasPrice = await web3_http.eth.getGasPrice();
        

        // Estimate gas required for the token transfer operation
        //const estimatedGas = await tokenContract.methods.transfer(central_address, balanceInWei).estimateGas({ from: user_address });

        // Calculate the total gas fee (base fee + token transfer gas)
        const gasFee =  Number(gasPrice) * gasLimit;

        // Check if userAddress has sufficient BNB balance for the total gas fee
        const bnbBalance = await web3_http.eth.getBalance(user_address);

        
        if (bnbBalance < gasFee) {
            // If insufficient BNB balance, calculate additional funds needed (e.g., 5x the gas fee)
            const gasFeetoFund = Number(gasFee); // Example: Multiply gas fee to cover potential fluctuations

            // Fill equivalent BNB gas fee to userAddress
           let result_payGasFeeInternal = await payGasFeeInternal(user_address, gasFeetoFund);
           if(result_payGasFeeInternal.status!=true){
            return result_payGasFeeInternal;
            }
        }
        

        const data = tokenContract.methods.transfer(central_address, balanceInWei).encodeABI();
        const nonce = await web3_http.eth.getTransactionCount(user_address);
        const txObject = {
            from: user_address,
            to: tokenContractAddress,
            gasLimit: gasLimit,
            gasPrice: gasPrice,
            data: data,
            nonce: nonce
        };

        const private_key = address_meta.data.private_key;
        const signedTx = await web3_http.eth.accounts.signTransaction(txObject, private_key);
        const receipt_token_withdrawal = await web3_http.eth.sendSignedTransaction(signedTx.rawTransaction);
       
        // const fee_payer_address = MODULE1_CRYPTOCURRENCY_AIRDROP_FEE_PAYER_ADDRESS;
        // const receipt_excess_bnb_withdrawal = await withdrawExcessBNBFee(user_id, from_address, fee_payer_address);
        
        // Push the Token to User Wallet 
        let pushTokentoUserWalletResponseDiplay;
        try {
             pushTokentoUserWalletResponseDiplay = await pushUserBEP20TransactionstoUserWallet(user_id, from_address, contract_address);

        } catch (error) {
            // Handle error as needed
            // console.error('Error in pushTokentoUserWalletResponseDiplay request:', error);
            if (error.response && error.response.data) {
                pushTokentoUserWalletResponseDiplay = error.response.data;
            } else {
                pushTokentoUserWalletResponseDiplay = error;
            }
        }


        response =  {
            status: true,
            status_code: 200,
            message: `Token Withdrawal to Central Address Successful`,
            data: { 
                    'token_contract_address' : contract_address,
                    'transaction_hash_token_withdrawal' : receipt_token_withdrawal.transactionHash,
                    'receipt_token_withdrawal' : receipt_token_withdrawal,
                    'push_token_to_user_wallet' : pushTokentoUserWalletResponseDiplay,

                    //'transaction_hash_excess_bnb_withdrawal' : receipt_excess_bnb_withdrawal.transactionHash,
                    //'receipt_excess_bnb_withdrawal' : receipt_excess_bnb_withdrawal
                    }
            };


        convertBigIntToInt(response);
        return response;
    }
    catch (error) {
        console.error('Error withdrawBEP20toCentralAddres:', error);
        throw error; // Throw error for handling at higher level
    }
}

async function pushUserBEP20TransactionstoUserWallet(user_id, from_address, contract_address) {



    try {

        // Sample data with allowed BEP20 contracted addresses
        // let allowed_bep20_contract_address = MODULE1_CRYPTOCURRENCY_ALLOWED_BEP20_CONTRACT_ADDRESS;
        let allowed_bep20_contract_address = await getAllowedDepositContract(contract_deposit_filename);

 
        // Check if the contract_address exists in the allowed_bep20_contract_address array
        const contract_data = allowed_bep20_contract_address.find(obj => obj.hasOwnProperty(contract_address));

        if (!contract_data) {
            const response = {
                status: false,
                status_code: 400,
                message: `Contract address ${contract_address} not found in allowed contracts.`,
                error: { 
                        error_data: {
                            user_id : user_id,
                            from_address : from_address,
                            contract_address : contract_address
                            }
                        }
            };
            return response;
        }
        const contract_address_lowercase = contract_address.toLowerCase();


        const rimplenet_backend_wallet_id_to_deposit_to_user_wallet = contract_data[contract_address].rimplenet_backend_wallet_id_to_deposit_to_user_wallet;
        if (!rimplenet_backend_wallet_id_to_deposit_to_user_wallet) {
            const response = {
                status: false,
                status_code: 400,
                message: `Rimplenet deposit wallet id ${rimplenet_backend_wallet_id_to_deposit_to_user_wallet} not specified on contract info.`,
                error: { 
                        error_data: {
                            user_id : user_id,
                            from_address : from_address,
                            contract_address : contract_address,
                            rimplenet_backend_wallet_id_to_deposit_to_user_wallet : rimplenet_backend_wallet_id_to_deposit_to_user_wallet
                            }
                        }
            };
            return response;
        }

        const address = from_address; // Assuming from_address is the address parameter

        const transactionListsRequest = await fetchListTransactionsBEP20(from_address, contract_address, 5, 1, true);
        let transactionLists;
        if (transactionListsRequest.status===true && transactionListsRequest.data.transactions) {
            transactionLists = transactionListsRequest.data.transactions;
        }

        if (transactionLists && transactionLists.length > 0) {
            transactionLists.sort((a, b) => a.blockNumber - b.blockNumber); // Sort the list in ascending order

            let lastPushedTransactionBlockNumber;

            for (const transaction of transactionLists) {
                const creditUrl = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/rimplenet/v1/credits`;

                if (transaction.middleware_can_push_this_transaction === true) {
                    let appCreditResponseData;

                    try {
                        if(MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK==="testnet"){
                            transaction_verification_url = `https://testnet.bscscan.com/tx/${transaction.request_id}`;
                        }else{
                            transaction_verification_url = `https://bscscan.com/tx/${transaction.request_id}`;
                        }
                        // Send credit request to the backend
                        const creditResponse = await axios.post(creditUrl, {
                            request_id: transaction.request_id,
                            user_id: transaction.user_id,
                            wallet_id: transaction.wallet_id,
                            amount: transaction.amount,
                            note: transaction.note,
                            meta_data : {
                                transaction_type_category : "deposits",
                                transaction_action_type : "blockchain_bscscan_deposit_bep20",
                                transaction_processor : "middleware",
                                transaction_external_processor : "bscscan",
                                transaction_verification_url : transaction_verification_url,
                                blockchain_processor_network : MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK,
                                blockchain_transaction_hash: transaction.hash,
                                blockchain_block_number: transaction.blockNumber,
                                blockchain_from_address: transaction.from,
                                blockchain_to_address: transaction.to,
                                blockchain_value: transaction.value
                            }
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
                    transaction.user_wallet_credit_response_data = appCreditResponseData; // Append credit response data
                }
            }

            // Update user meta data with last pushed transaction block number
            const appAddressLastBlockNumberUserMetaUrl = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/${user_id}`;
            const appAddressLastBlockNumberUserMetaRequestBody = {
                [`${address}_app_address_deposit_last_block_number_${contract_address_lowercase}`]: lastPushedTransactionBlockNumber
            };

            const appAddressLastBlockNumberUserMetaResponse = await axios.put(
                appAddressLastBlockNumberUserMetaUrl,
                appAddressLastBlockNumberUserMetaRequestBody,
                {
                    headers: {
                        'x-api-key': MODULE1_BASE_API_KEY
                    }
                }
            );

            // Prepare response
            return {
                status: true,
                status_code: 200,
                message: "Transactions Pushed Successfully",
                data: {
                    transactions: transactionLists,
                    user_app_address_last_block_number_user_meta_response: appAddressLastBlockNumberUserMetaResponse.data
                }
            };
        } else {
            return {
                status: false,
                status_code: 404,
                message: "Transaction to Push not found",
                error: {
                    transactionListsRequest : transactionListsRequest
                }
            };
        }
    } catch (error) { 
        console.error('Error in pushUserBEP20TransactionstoUserWallet:', error);
        throw error; // Throw error for handling at higher level
    }
}

async function fetchListTransactionsBEP20(from_address, contract_address, per_page = 20, page_no = 1, retrieve_non_processed_block = false) {
    // Parse per_page and page_no to integers
    per_page = parseInt(per_page);
    page_no = parseInt(page_no);

    try {
         // Sample data with allowed BEP20 contracted addresses
         // let allowed_bep20_contract_address = MODULE1_CRYPTOCURRENCY_ALLOWED_BEP20_CONTRACT_ADDRESS;
        let allowed_bep20_contract_address = await getAllowedDepositContract(contract_deposit_filename);
        
        const contract_data = allowed_bep20_contract_address.find(obj => obj.hasOwnProperty(contract_address));

        if (!contract_data) {
                const response = {
                    status: false,
                    status_code: 400,
                    message: `Contract address ${contract_address} not found in allowed contracts.`,
                    error: { 
                            error_data: {
                                user_id : user_id,
                                from_address : from_address,
                                contract_address : contract_address
                                }
                            }
                };
                return response;
            }

        let rimplenet_backend_wallet_id_to_deposit_to_user_wallet = contract_data[contract_address].rimplenet_backend_wallet_id_to_deposit_to_user_wallet;
        if (!rimplenet_backend_wallet_id_to_deposit_to_user_wallet) {
            rimplenet_backend_wallet_id_to_deposit_to_user_wallet = contract_data[contract_address].token_symbol.toLowerCase();  
        }

        const address = from_address.toLowerCase(); // Convert from_address to lowercase

        // Check if meta value (address) exists in the app's database
        const userMetaUrl = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/utils/check-if-meta-value-exists?meta_key=eth_crypto_wallet_deposit_address&meta_value=${address}`;
        const userMetaUrlResponse = await axios.get(userMetaUrl);

        if (!userMetaUrlResponse.data.data.eth_crypto_wallet_deposit_address.meta_value === address) {
            const response = {
                status: false,
                status_code: 404,
                message: `Address ${address} does not exist in the app`
            };
            //throw new Error(JSON.stringify(response));
            return response;
        }
        const contract_address_lowercase = contract_address.toLowerCase();

        const userMetaID = userMetaUrlResponse.data.data.eth_crypto_wallet_deposit_address.user_id || 0;

        let startBlock, endBlock;
        if (retrieve_non_processed_block) {
            // Retrieve last block numbers specific to the address
            const app_address_deposit_last_block_number = `${address}_app_address_deposit_last_block_number_${contract_address_lowercase}`;
            const userMetaUrl2 = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/${userMetaID}?meta_key=eth_crypto_wallet_deposit_address,${app_address_deposit_last_block_number}`;
            const userMetaUrlResponse2 = await axios.get(userMetaUrl2);

            // Determine startBlock and endBlock based on retrieved metadata
            startBlock = userMetaUrlResponse2.data.data[app_address_deposit_last_block_number] || 0;
            endBlock = 'latest'; // Use 'latest' to retrieve up to the latest block
        } else {
            // Retrieve transactions from genesis block to latest
            startBlock = 0;
            endBlock = 'latest';
        }

        // console.log("Start Block", startBlock);
        // console.log("End Block", endBlock);
        
        let apiUrl;
        if (MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK === "testnet") {
            apiUrl = `https://api.etherscan.io/v2/api?chainid=97&module=account&action=tokentx&contractaddress=${contract_address}&address=${address}&page=${page_no}&offset=${per_page}&startblock=${startBlock}&endblock=${endBlock}&sort=desc&apikey=${MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY}`;
        } else {
            apiUrl = `https://api.etherscan.io/v2/api?chainid=56&module=account&action=tokentx&contractaddress=${contract_address}&address=${address}&page=${page_no}&offset=${per_page}&startblock=${startBlock}&endblock=${endBlock}&sort=desc&apikey=${MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY}`;
        }

        const response = await axios.get(apiUrl);

        console.log(`fetchListTransactionsBEP20 response for ${contract_address}`, response);


        if (response.data.status === '1') {
            const result = response.data.result;

            let WithdrawnToCentralAddressBlocknumber;
            const transactions = result.map(transaction => {

                const tokenDecimalInt = parseInt(transaction.tokenDecimal);
                const amount_value_readable = parseFloat(transaction.value) / Math.pow(10, tokenDecimalInt); // Convert from token amount to readable value

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

                if (transaction_to_central_address === "yes") {
                    WithdrawnToCentralAddressBlocknumber = parseInt(transaction.blockNumber);
                }

                const transaction_to_app_wallet_address = transaction.to === address ? 'yes' : 'no';

                let admin_can_push_this_transaction = false;
                let middleware_can_push_this_transaction = false;
                let user_can_push_this_transaction = false;

                if (transaction_to_app_wallet_address === 'yes') {
                    admin_can_push_this_transaction = true;
                }

                let thisTxnBlockNumber = parseInt(transaction.blockNumber);
                if (transaction_to_app_wallet_address === 'yes' && thisTxnBlockNumber < WithdrawnToCentralAddressBlocknumber) {
                    middleware_can_push_this_transaction = true;
                    user_can_push_this_transaction = true;
                }

                let mappedTransaction = {
                    ...transaction,
                    amount_value_readable,
                    transaction_to_central_address,
                    transaction_to_app_wallet_address,
                    admin_can_push_this_transaction,
                    middleware_can_push_this_transaction,
                    user_can_push_this_transaction
                };

                if (admin_can_push_this_transaction || middleware_can_push_this_transaction) {
                    mappedTransaction = {
                        ...mappedTransaction,
                        request_id: transaction.hash,
                        user_id: userMetaID,
                        wallet_id: rimplenet_backend_wallet_id_to_deposit_to_user_wallet,
                        amount: parseFloat(transaction.value) / Math.pow(10, tokenDecimalInt),
                        note: 'Deposit Received - ' + transaction.hash
                    };
                }

                return mappedTransaction;
            });

            return {
                    status: true,
                    status_code: 200,
                    message: "Transactions Lists Retrieved Successfully",
                    data : { transactions : transactions}
                  };

        } else {

            return {
                status: false,
                status_code: 404,
                message: "Transaction not found"
            };

        }
    } catch (error) {
        console.error('Error fetchListTransactionsBEP20:', error);
        throw error;
    }
}

async function payGasFeeInternal(to_address, gasFee) {
    try {

        const private_key_pay_gas_fee = MODULE1_CRYPTOCURRENCY_AIRDROP_FEE_PAYER_ADDRESS_PRIVATE_KEY;
        const fee_payer_address = MODULE1_CRYPTOCURRENCY_AIRDROP_FEE_PAYER_ADDRESS;
        const bnbBalance = await web3_http.eth.getBalance(fee_payer_address);

        const gasLimit = 100000; // Assuming standard gas limit of 100000 for a smart contract transaction
        const gasPrice = await web3_http.eth.getGasPrice();
        const bnbBalanceInEther = web3_http.utils.fromWei(bnbBalance, 'ether');
        
        if(!gasFee){
            gasFee = Number(gasPrice) * gasLimit; 
        }
 

        if (bnbBalanceInEther <= 0) {
            const response = {
                status: false,
                status_code: 400,
                message: 'Gas Fee Payer Address has zero BNB balance.',
                error: {  fee_payer_address: fee_payer_address,
                          bnb_balance_in_ether: bnbBalanceInEther }
            };

            convertBigIntToInt(response);
            return response;
        }

        if (bnbBalance < gasFee) {
            let response =  {
            status: false,
            status_code: 400,
            message: `Gas Fee Payer Address has BNB balance less than gas fee`,
            error : {   fee_payer_address: fee_payer_address,
                        bnb_balance_in_ether: bnbBalanceInEther,
                        bnb_balance: bnbBalance,
                        gas_fee: gasFee
                    }
            };

            convertBigIntToInt(response);
            return response;
        }

        let all_gas_fee = Number(gasFee) + (Number(gasPrice) * gasLimit)
        if (bnbBalance < all_gas_fee) {
            let response =  {
            status: false,
            status_code: 400,
            message: `Gas Fee Payer Address has no enough BNB balance plus its internal gas fee to process`,
            error : {   fee_payer_address: fee_payer_address,
                        bnb_balance_in_ether: bnbBalanceInEther,
                        bnb_balance: bnbBalance,
                        gas_fee: gasFee,
                        all_gas_fee: all_gas_fee
                    }
            };


            convertBigIntToInt(response);
            return response;
        }

        let contractAddress;
        if (MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK === "mainnet") {

            contractAddress = '0x0c577c0a7c59a6716eb46f91b64d3823724c5aa0';

        } else {
            
            contractAddress = '0x8351f9c8714bb41f130b55ef1c2f7f08428ee3ef';

        }

        // GasFeeHandler contract ABI
        const gasFeeHandlerABI = [
            {
                "constant": false,
                "inputs": [
                    {
                        "name": "toAddress",
                        "type": "address"
                    },
                    {
                        "name": "gasFee",
                        "type": "uint256"
                    }
                ],
                "name": "payGasFee",
                "outputs": [],
                "payable": true,
                "stateMutability": "payable",
                "type": "function"
            }
        ];

        // Create contract instance
        const gasFeeHandlerContract = new web3_http.eth.Contract(gasFeeHandlerABI, contractAddress);

        // Convert gasFee to Wei
        // const gasFeeInWei = web3_http.utils.toWei(gasFee.toString(), 'ether');

        // Prepare transaction data
        const transactionData = gasFeeHandlerContract.methods.payGasFee(to_address, gasFee).encodeABI();

        // Construct transaction object
        const transactionObject = {
            from: fee_payer_address,
            to: contractAddress,
            gas: gasLimit, // Adjust gas limit as needed
            gasPrice: gasPrice, // Adjust gas price as needed
            value: gasFee,
            data: transactionData
        };

        // Sign and send transaction
        const signedTx = await web3_http.eth.accounts.signTransaction(transactionObject, private_key_pay_gas_fee);

        // Send the signed transaction
        const gas_fee_receipt = await web3_http.eth.sendSignedTransaction(signedTx.rawTransaction);

        let response = {
                    status: true,
                    status_code: 200,
                    message: `Gas Fee Sent Successfully`,
                    data: {
                        "transaction_hash": gas_fee_receipt.transactionHash,
                        "receipt": gas_fee_receipt
                    }
                };
        
        convertBigIntToInt(response);
        return response;
    } catch (error) {
        console.error('Error on payGasFeeInternal:', error);
        throw error; // Throw error for handling at higher level (e.g., in the caller)
    }
}

async function fillGasFee(to_address, gasFee) {
    try {

        const fee_payer_address = MODULE1_CRYPTOCURRENCY_AIRDROP_FEE_PAYER_ADDRESS;
        const bnbBalance = await web3_http.eth.getBalance(fee_payer_address);

        const gasLimit = 21000; // Assuming standard gas limit of 21000 for a simple transaction
        const gasPrice = await web3_http.eth.getGasPrice();
        const bnbBalanceInEther = web3_http.utils.fromWei(bnbBalance, 'ether');
        
        if(!gasFee){
            gasFee = Number(gasPrice) * gasLimit; 
        }
 

        if (bnbBalanceInEther <= 0) {
            const response = {
                status: false,
                status_code: 400,
                message: 'Gas Fee Payer Address has zero BNB balance.',
                error: {  fee_payer_address: fee_payer_address,
                          bnb_balance_in_ether: bnbBalanceInEther }
            };

            convertBigIntToInt(response);
            return response;
        }

        if (bnbBalance < gasFee) {
            let response =  {
            status: false,
            status_code: 400,
            message: `Gas Fee Payer Address has BNB balance less than gas fee`,
            error : {   fee_payer_address: fee_payer_address,
                        bnb_balance_in_ether: bnbBalanceInEther,
                        bnb_balance: bnbBalance,
                        gas_fee: gasFee
                    }
            };


            convertBigIntToInt(response);
            return response;
        }

        let all_gas_fee = Number(gasFee) + (Number(gasPrice) * gasLimit)
        if (bnbBalance < all_gas_fee) {
            let response =  {
            status: false,
            status_code: 400,
            message: `Gas Fee Payer Address has no enough BNB balance plus its internal gas fee to process`,
            error : {   fee_payer_address: fee_payer_address,
                        bnb_balance_in_ether: bnbBalanceInEther,
                        bnb_balance: bnbBalance,
                        gas_fee: gasFee,
                        all_gas_fee: all_gas_fee
                    }
            };


            convertBigIntToInt(response);
            return response;
        }


        const nonce = await web3_http.eth.getTransactionCount(fee_payer_address);
        const txObject = {
            from: fee_payer_address,
            to: to_address,
            value: gasFee,
            gasPrice: gasPrice,
            gasLimit: gasLimit,
            nonce: nonce
        };
        
        const private_key_address_fill_gas_fee = MODULE1_CRYPTOCURRENCY_AIRDROP_FEE_PAYER_ADDRESS_PRIVATE_KEY;
        const signedTx = await web3_http.eth.accounts.signTransaction(txObject, private_key_address_fill_gas_fee);
        let gas_fee_receipt = await web3_http.eth.sendSignedTransaction(signedTx.rawTransaction);

        let response = {
                    status: true,
                    status_code: 200,
                    message: `Gas Fee Sent Successfully`,
                    data: {
                        "transaction_hash": gas_fee_receipt.transactionHash,
                        "receipt": gas_fee_receipt
                    }
                };
        
        convertBigIntToInt(response);
        return response;

    }
    catch (error) {
        console.error('Error fillGasFee:', error);
        throw error; // Throw error for handling at higher level
    }
}

async function withdrawExcessBNBFee(user_id, from_address, to_address) {
    try {
        // Get the BNB balance of the user's address
        const balance = await web3_http.eth.getBalance(from_address);
        const balanceInEther = web3_http.utils.fromWei(balance, 'ether');

        // Check if the user's balance is zero
        if (balanceInEther <= 0) {
            const response = {
                status: false,
                status_code: 400,
                message: 'User has zero BNB balance.',
                error: { balanceInEther: balanceInEther }
            };
            return response;
        }

        // Calculate gas fees and amount to send
        const gasPrice = await web3_http.eth.getGasPrice();
        const gasFeesWei = gasPrice * BigInt(21000n);
        const balanceWei = balance;
        const amountToSendWei = balanceWei - gasFeesWei;

        // Check if there's enough balance to cover gas fees
        if (amountToSendWei <= BigInt(0)) {
            const response = {
                status: false,
                status_code: 400,
                message: 'Insufficient balance to cover gas fees.',
                error: {    balance_in_wei: balanceWei,
                            gas_fees_in_wei: gasFeesWei,
                            amount_to_send_wei: amountToSendWei,
                            from_address: from_address,
                            to_address: to_address,
                            user_id: user_id
                         }
            };
            return response;
        }

        // Prepare the transaction object
        const txObject = {
            to: to_address,
            value: amountToSendWei.toString(),
            gas: '0x5208', // Gas limit for the transaction (adjust as needed)
            gasPrice: gasPrice.toString(),
            nonce: await web3_http.eth.getTransactionCount(from_address),
        };

        // Sign and send the transaction
        const privateKey = await getPrivateKeyForUser(user_id); // Fetch private key based on user_id
        const signedTx = await web3_http.eth.accounts.signTransaction(txObject, privateKey);
        const receipt = await web3_http.eth.sendSignedTransaction(signedTx.rawTransaction);

        // Transaction successful
        const response = {
            status: true,
            status_code: 200,
            message: 'Excess BNB withdrawal successful.',
            data: { transaction_hash: receipt.transactionHash,
                    receipt: receipt }
        };

        convertBigIntToInt(response);
        return response;
    } catch (error) {
        console.error('Error in withdrawExcessBNBMain:', error);
        throw error; // Throw error for handling at higher level
    }
}



async function getAddressMetaData(user_id, show_pk="no") {
    try {

        let response;
        if(user_id>0){

            const mnemonic = MODULE1_CRYPTOCURRENCY_MNEMONIC; //generates string
            //console.log("MNEMONIC: " + mnemonic);
            const seed = async () => {
                const testseed = await bip39.mnemonicToSeed(mnemonic); //creates seed buffer
                return testseed;
            };
            const testseed = await seed();
            const root = hdkey.fromMasterSeed(testseed);
            const masterPrivateKey = root.privateKey.toString("hex");
            const addrNode = root.derive("m/44'/60'/0'/0/" + user_id); //you can change the last 0 for different account
            const pubKey = ethUtil.privateToPublic(addrNode._privateKey);
            const address = "0x" + ethUtil.publicToAddress(pubKey).toString("hex");
            const address_checksum = ethUtil.toChecksumAddress(address);
            const privateKeyGen = addrNode._privateKey.toString('hex');
            // console.log("===================================================");
            // console.log("User - " + user_id);
            // console.log("Address: " + address);
            // console.log("Private Key: " + privateKeyGen);
            privateKeyShow = privateKeyGen;

            address_to_check_res = address;
            address_checksum_res = address_checksum;

            response = {
                            status: true,
                            status_code: 200,
                            message: `Address Meta Retrieved Successfully`,
                            data: {
                                "user_id": user_id,
                                "address": address,
                                "address_checksum": address_checksum,
                                //"privateKeyShow": privateKeyShow

                            }
                        };
            if(show_pk=="yes"){
               response.data.private_key = privateKeyShow;
            }

            
        }
        else{
            //This means this request is to generate MNEMMOIC
            generated_mnemonic = bip39.generateMnemonic(); //generates string
            response = {
                    status: true,
                    status_code: 200,
                    message: `MNEMONIC Generated Successfully`,
                    data: {
                        "generated_mnemonic": generated_mnemonic,
                    }
                };
        }

        convertBigIntToInt(response);
        return response;
    }
    catch (error) {
        console.error('Error getAddressMetaData:', error);
        throw error; // Throw error for handling at higher level
    }
}

// Define a function to read from a JSON file
async function getAllowedDepositContract(contract_deposit_filename) {
    try {
        // Construct the absolute path to the ABI file using __dirname
        const filePath = path.join(__dirname, 'contract-abi', `${contract_deposit_filename}-allowed-deposit-contract.json`);

        // Read the ABI from the file
        const fileData = await fs.readFile(filePath, 'utf-8');

        // Parse the JSON data to get the ABI object
        const data = JSON.parse(fileData);

        return data;
    } catch (error) {
        console.error('Error reading file:', error);
        throw error; // Throw error for handling at higher level
    }
}

async function getContractAbi() {
    try {
        // Specify the relative path to the ABI file
        const abiFilePath = abiFilePathtoABI;
               
        // Read the ABI from the file
        const abiData = await fs.readFile(abiFilePath, 'utf-8');

        // Parse the JSON data to get the ABI
        const abi = JSON.parse(abiData);

        return abi;
    } catch (error) {
        console.error('Error reading Contract ABI file:', error);
        throw error; // Throw error for handling at higher level
    }
}


// Function to retrieve the private key for a given user_id
async function getPrivateKeyForUser(user_id) {
    try {
        // Retrieve mnemonic from environment variable or secure location
        const mnemonic = process.env.MODULE1_CRYPTOCURRENCY_MNEMONIC; // Example: 'your mnemonic phrase here'

        if (!mnemonic) {
            throw new Error('Mnemonic phrase not found.');
        }

        // Derive private key from mnemonic based on user_id
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const root = hdkey.fromMasterSeed(seed);
        const addrNode = root.derive(`m/44'/60'/0'/0/${user_id}`);
        const privateKeyHex = addrNode._privateKey.toString('hex');

        return privateKeyHex;
    } catch (error) {
        console.error('Error in getPrivateKeyForUser:', error);
        throw error; // Throw error for handling at higher level
    }
}

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

// Export the router and the function
module.exports = {
    withdrawUserBNBtoCentralAddress: withdrawUserBNBtoCentralAddress,
    pushUserBNBTransactionstoUserWallet: pushUserBNBTransactionstoUserWallet,
    withdrawUserBEP20toCentralAddress: withdrawUserBEP20toCentralAddress,
    pushUserBEP20TransactionstoUserWallet: pushUserBEP20TransactionstoUserWallet,
    payGasFeeInternal : payGasFeeInternal,
    fillGasFee: fillGasFee,
    getAddressMetaData : getAddressMetaData,
    getContractAbi: getContractAbi
};
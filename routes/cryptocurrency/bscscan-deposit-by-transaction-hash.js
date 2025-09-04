const express = require('express');
const axios = require('axios');
const { Web3 } = require('web3'); // Note: Web3 should be capitalized
const bip39 = require('bip39');
const hdkey = require("hdkey");
const ethUtil = require("ethereumjs-util");
const router = express.Router();

const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');
// Import the utils function 
const { withdrawUserBEP20toCentralAddress, withdrawUserBNBtoCentralAddress, getAllowedDepositContract } = require('./utils');

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

const MODULE1_CRYPTOCURRENCY_QUICKNODE_API_URL = process.env.MODULE1_CRYPTOCURRENCY_QUICKNODE_API_URL || 'YourApiKey'; // You need to replace 'YourApiKey' with your actual API key
const contract_deposit_filename = process.env.MODULE1_CRYPTOCURRENCY_ALLOWED_BEP20_DEPOSIT_CONTRACTS_FILENAME;

// Initialize Web3 with BSC testnet and mainnet endpoints
let web3_http, web3_wss, bscscan_api_url;
try {
    if (MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK === "testnet") {
        web3_http = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET}`);
        web3_wss = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET}`);
        bscscan_api_url = `https://api-testnet.bscscan.com/api?apikey=${MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY}`;

    } else {
        web3_http = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET}`);
       // web3_wss = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET}`);
        bscscan_api_url = `https://api.bscscan.com/api?apikey=${MODULE1_CRYPTOCURRENCY_BSCSCAN_API_KEY}`;

    }

}
catch (error) { 
    console.error("Error occurred while initializing ENV providers:", error.message);
    // Handle the error as needed, for example, by providing a default value or exiting the program
}

router.get('/:transactionHash', async function(req, res, next) {
    try {


        // Extracting data from the request url
        const transaction_hash = req.params.transactionHash;

        //let scan = req.query.scan || 'bnb_txn'; // bnb or token

        //STEP : check if transaction already exists 
        const transaction_exist_url = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/rimplenet/v3/transactions?order=ASC&per_page=1&page_no=1&order_by=ID&transaction_type=CREDIT&meta_key=request_id&meta_value=${transaction_hash}`;
        const transaction_exist_response = await axios.get(transaction_exist_url);
        if (transaction_exist_response.data.status===true && transaction_exist_response.data.data) {
            const txn_id = transaction_exist_response.data.data[0].ID;
            const response = {
                status: false,
                status_code: 400,
                message: `Transaction already deposited at transaction - #${txn_id}`,
                error : {
                    error_data : transaction_exist_response.data
                }
                
            };

            return res.send(response);
        }
        
        
        // Extracting data from the request body
        const { user_id_performing_request, action_to_perform, meta_data } = req.body;

        // Call QuickNode API to get transaction information
        const quick_node_api_url = MODULE1_CRYPTOCURRENCY_QUICKNODE_API_URL;

        let quick_node_request_data, bscscan_transaction_hash_response, scan;
        // if (scan==="bnb_txn") {
        //     quick_node_request_data = {
        //         method: "eth_getTransactionByHash",
        //         params: [transaction_hash],
        //         id: 1,
        //         jsonrpc: "2.0"
        //         };  
        // }
        // else{
        //     quick_node_request_data = {
        //         method: "eth_getTransactionReceipt",
        //         params: [transaction_hash],
        //         id: 1,
        //         jsonrpc: "2.0"
        //         }; 
        // }

            //Setup for Token Transaction First
            quick_node_request_data = {
                    method: "eth_getTransactionReceipt",
                    params: [transaction_hash],
                    id: 1,
                    jsonrpc: "2.0"
                    };
            bscscan_transaction_hash_response = await axios.post(quick_node_api_url, quick_node_request_data, {
                headers: {
                    "Content-Type": "application/json"
                }
            });

        //STEP - Check if transaction data was retrieved
        if (!bscscan_transaction_hash_response.data.result) {
              const response = {
                status: false,
                status_code: 400,
                message: `Transaction data for hash ${transaction_hash} not found`,
                error: { 
                        error_data: bscscan_transaction_hash_response.data
                        }
              };
              return res.send(response);
        }
        
        //STEP - Check if transaction data is token or bnb
        if(!bscscan_transaction_hash_response.data.result.logs.length) {//meaning it is not token_tx
                scan = 'bnb_txn'; // bnb or token
                quick_node_request_data = {
                                        method: "eth_getTransactionByHash",
                                        params: [transaction_hash],
                                        id: 1,
                                        jsonrpc: "2.0"
                                        };  
            bscscan_transaction_hash_response = await axios.post(quick_node_api_url, quick_node_request_data, {
                headers: {
                    "Content-Type": "application/json"
                }
            });            
         }
         else{
                scan = 'token_txn'; // bnb or token

         }



        const transaction_data = bscscan_transaction_hash_response.data;

        // // SAMPLE - BNB TRANSACTION eth_getTransactionByHash RPC Method RETURNED DATA 
        // const transaction_data =    {
        //                                 "jsonrpc": "2.0",
        //                                 "id": 1,
        //                                 "result": {
        //                                     "blockHash": "0x5836c975cdab8be8bc830beb18f0508a92ba054321f21905f694b00eec5eb5af",
        //                                     "blockNumber": "0x263c41c",
        //                                     "from": "0xfdf18b64946d8c865b356b8a5d5dcaa01b1d68e9",
        //                                     "gas": "0x5208",
        //                                     "gasPrice": "0x12a05f200",
        //                                     "maxFeePerGas": "0x12a05f200",
        //                                     "maxPriorityFeePerGas": "0x12a05f200",
        //                                     "hash": "0xc2cf8e4c9135809ea8aaf0893ce7274bd1ed33bf34c6f6e78bf286ca35b5d570",
        //                                     "input": "0x",
        //                                     "nonce": "0x6a",
        //                                     "to": "0xcbd37bc6f32dbdfa0dfc8d85bec7f4351149aeab",
        //                                     "transactionIndex": "0xa",
        //                                     "value": "0x2386f26fc10000",
        //                                     "type": "0x2",
        //                                     "accessList": [],
        //                                     "chainId": "0x61",
        //                                     "v": "0x0",
        //                                     "r": "0x29cf30d8ffc5573eb8bee1123bc3516b5a43979f351192a05a666a9c7289fa75",
        //                                     "s": "0x72ae09f4bfe774ca200e917b34a95e07707dfe4614f4087508313fc0125e45cb",
        //                                     "yParity": "0x0"
        //                                 }
        //                             };

       // // SAMPLE - CONTRACT TRANSACTION eth_getTransactionByHash RPC Method RETURNED DATA 
       //  const transaction_data =    {
       //                          "jsonrpc": "2.0",
       //                          "id": 1,
       //                          "result": {
       //                              "blockHash": "0x82899532b705443030da54555b8119002f7175fc66d107445998e32eccf60fff",
       //                              "blockNumber": "0x263caf3",
       //                              "from": "0xfdf18b64946d8c865b356b8a5d5dcaa01b1d68e9",
       //                              "gas": "0x12e4a",
       //                              "gasPrice": "0x12a05f200",
       //                              "maxFeePerGas": "0x12a05f200",
       //                              "maxPriorityFeePerGas": "0x12a05f200",
       //                              "hash": "0x391b659fdbb35f287970d739dc0f485071e21dec4d39b77740581ca8e9cb6509",
       //                              "input": "0xa9059cbb000000000000000000000000cbd37bc6f32dbdfa0dfc8d85bec7f4351149aeab00000000000000000000000000000000000000000000000000470de4df820000",
       //                              "nonce": "0x6b",
       //                              "to": "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",
       //                              "transactionIndex": "0x14",
       //                              "value": "0x0",
       //                              "type": "0x2",
       //                              "accessList": [],
       //                              "chainId": "0x61",
       //                              "v": "0x1",
       //                              "r": "0x618d4d8a70867a58afe99e5304ff71a5f30d5d9519ebda046ba9237fa9cadb09",
       //                              "s": "0x3cf598b205dbbceb336fe64d4f5f530fbae0fd7559a74ef3485be148b8d90d11",
       //                              "yParity": "0x1"
       //                          }
       //                       };


        // // // SAMPLE - BNB TRANSACTION eth_getTransactionReceipt RPC Method RETURNED DATA 
        // const transaction_data =                           {
        //     "jsonrpc": "2.0",
        //     "id": 1,
        //     "result": {
        //         "blockHash": "0x5836c975cdab8be8bc830beb18f0508a92ba054321f21905f694b00eec5eb5af",
        //         "blockNumber": "0x263c41c",
        //         "contractAddress": null,
        //         "cumulativeGasUsed": "0x3ab23c",
        //         "effectiveGasPrice": "0x12a05f200",
        //         "from": "0xfdf18b64946d8c865b356b8a5d5dcaa01b1d68e9",
        //         "gasUsed": "0x5208",
        //         "logs": [],
        //         "logsBloom": "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        //         "status": "0x1",
        //         "to": "0xcbd37bc6f32dbdfa0dfc8d85bec7f4351149aeab",
        //         "transactionHash": "0xc2cf8e4c9135809ea8aaf0893ce7274bd1ed33bf34c6f6e78bf286ca35b5d570",
        //         "transactionIndex": "0xa",
        //         "type": "0x2"
        //     }
        // };

        // // SAMPLE - CONTRACT TRANSACTION eth_getTransactionReceipt RPC Method RETURNED DATA 
        // const transaction_data = {
        //                 "jsonrpc": "2.0",
        //                 "id": 1,
        //                 "result": {
        //                     "blockHash": "0x82899532b705443030da54555b8119002f7175fc66d107445998e32eccf60fff",
        //                     "blockNumber": "0x263caf3",
        //                     "contractAddress": null,
        //                     "cumulativeGasUsed": "0x33bbe1",
        //                     "effectiveGasPrice": "0x12a05f200",
        //                     "from": "0xfdf18b64946d8c865b356b8a5d5dcaa01b1d68e9",
        //                     "gasUsed": "0xc987",
        //                     "logs": [
        //                         {
        //                             "address": "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",
        //                             "topics": [
        //                                 "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        //                                 "0x000000000000000000000000fdf18b64946d8c865b356b8a5d5dcaa01b1d68e9",
        //                                 "0x000000000000000000000000cbd37bc6f32dbdfa0dfc8d85bec7f4351149aeab"
        //                             ],
        //                             "data": "0x00000000000000000000000000000000000000000000000000470de4df820000",
        //                             "blockNumber": "0x263caf3",
        //                             "transactionHash": "0x391b659fdbb35f287970d739dc0f485071e21dec4d39b77740581ca8e9cb6509",
        //                             "transactionIndex": "0x14",
        //                             "blockHash": "0x82899532b705443030da54555b8119002f7175fc66d107445998e32eccf60fff",
        //                             "logIndex": "0x38",
        //                             "removed": false
        //                         }
        //                     ],
        //                     "logsBloom": "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000004000000000000001000000000000000000000000000000000000010000000000000000000000040000000000000000000040000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000010000800",
        //                     "status": "0x1",
        //                     "to": "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",
        //                     "transactionHash": "0x391b659fdbb35f287970d739dc0f485071e21dec4d39b77740581ca8e9cb6509",
        //                     "transactionIndex": "0x14",
        //                     "type": "0x2"
        //                 }
        //             };
    
    // let transaction_data;
    // if (scan==="bnb_txn") {
    //     // SAMPLE - BNB TRANSACTION eth_getTransactionByHash RPC Method RETURNED DATA 
    //     transaction_data =    {
    //                                 "jsonrpc": "2.0",
    //                                 "id": 1,
    //                                 "result": {
    //                                     "blockHash": "0x5836c975cdab8be8bc830beb18f0508a92ba054321f21905f694b00eec5eb5af",
    //                                     "blockNumber": "0x263c41c",
    //                                     "from": "0xfdf18b64946d8c865b356b8a5d5dcaa01b1d68e9",
    //                                     "gas": "0x5208",
    //                                     "gasPrice": "0x12a05f200",
    //                                     "maxFeePerGas": "0x12a05f200",
    //                                     "maxPriorityFeePerGas": "0x12a05f200",
    //                                     "hash": "0xc2cf8e4c9135809ea8aaf0893ce7274bd1ed33bf34c6f6e78bf286ca35b5d570",
    //                                     "input": "0x",
    //                                     "nonce": "0x6a",
    //                                     "to": "0x60377263c1ea25d8d65f541bac761ae9d077242a",
    //                                     "transactionIndex": "0xa",
    //                                     "value": "0x2386f26fc10000",
    //                                     "type": "0x2",
    //                                     "accessList": [],
    //                                     "chainId": "0x61",
    //                                     "v": "0x0",
    //                                     "r": "0x29cf30d8ffc5573eb8bee1123bc3516b5a43979f351192a05a666a9c7289fa75",
    //                                     "s": "0x72ae09f4bfe774ca200e917b34a95e07707dfe4614f4087508313fc0125e45cb",
    //                                     "yParity": "0x0"
    //                                 }
    //                             };
    // }
    // else{

    //     // SAMPLE - CONTRACT TRANSACTION eth_getTransactionReceipt RPC Method RETURNED DATA 
    //     transaction_data = {
    //                     "jsonrpc": "2.0",
    //                     "id": 1,
    //                     "result": {
    //                         "blockHash": "0x82899532b705443030da54555b8119002f7175fc66d107445998e32eccf60fff",
    //                         "blockNumber": "0x263caf3",
    //                         "contractAddress": null,
    //                         "cumulativeGasUsed": "0x33bbe1",
    //                         "effectiveGasPrice": "0x12a05f200",
    //                         "from": "0xfdf18b64946d8c865b356b8a5d5dcaa01b1d68e9",
    //                         "gasUsed": "0xc987",
    //                         "logs": [
    //                             {
    //                                 "address": "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",
    //                                 "topics": [
    //                                     "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    //                                     "0x000000000000000000000000fdf18b64946d8c865b356b8a5d5dcaa01b1d68e9",
    //                                     "0x00000000000000000000000060377263c1ea25d8d65f541bac761ae9d077242a"
    //                                 ],
    //                                 "data": "0x00000000000000000000000000000000000000000000000000470de4df820000",
    //                                 "blockNumber": "0x263caf3",
    //                                 "transactionHash": "0xa6e4b832d26502b305510f93ff3d74a34fcbee275b69f93518dddcc58ab30b09",
    //                                 "transactionIndex": "0x14",
    //                                 "blockHash": "0x82899532b705443030da54555b8119002f7175fc66d107445998e32eccf60fff",
    //                                 "logIndex": "0x38",
    //                                 "removed": false
    //                             }
    //                         ],
    //                         "logsBloom": "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000004000000000000001000000000000000000000000000000000000010000000000000000000000040000000000000000000040000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000010000800",
    //                         "status": "0x1",
    //                         "to": "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",
    //                         "transactionHash": "0xa6e4b832d26502b305510f93ff3d74a34fcbee275b69f93518dddcc58ab30b09",
    //                         "transactionIndex": "0x14",
    //                         "type": "0x2"
    //                     }
    //                 };
    
    // }

      
    let request_id, wallet_id, amount, address_from, address_to, contract_address, token_tx_amount_wei , transaction_hash_blockchain;
    

    if(scan==="bnb_txn") { //it means BNB Transaction

        // Convert decimal value from Wei to Ether
        const value_in_wei = web3_http.utils.toNumber(transaction_data.result.value);
        const value_human_readable = web3_http.utils.fromWei(value_in_wei, 'ether');
        amount = parseFloat(value_human_readable);
        request_id = transaction_data.result.hash;
        wallet_id = "bnb";
        address_from = transaction_data.result.from;
        address_to = transaction_data.result.to;
        contract_address = null;
        transaction_hash_blockchain = transaction_data.result.hash;

      }
    else{ //It means contract transaction

        // const logs_data_hex = "00000000000000000000000000000000000000000000000000470de4df820000";
        const logs_data_hex = transaction_data.result.logs[0].data;

        // Remove leading "0x"
        const logs_data_hex_without_prefix = logs_data_hex.slice(2);
        console.log("logs_data_hex_without_prefix",logs_data_hex_without_prefix);

        // Parse hexadecimal string to decimal value
        const logs_data_decimal_value = BigInt("0x" + logs_data_hex_without_prefix);
        console.log("logs_data_decimal_value",logs_data_decimal_value); 

        // Convert decimal value from Wei to Ether
        const logs_data_value_in_wei = web3_http.utils.toNumber(logs_data_decimal_value);
        //const logs_data_value_human_readable = web3_http.utils.fromWei(logs_data_value_in_wei, 'ether');
        //amount = parseFloat(logs_data_value_human_readable);
        token_tx_amount_wei = logs_data_value_in_wei;


        // Address with leading zeros
        const logs_data_address_from_with_zeros = transaction_data.result.logs[0].topics[2];
        // Remove leading zeros
        const logs_data_address_from_without_zeros = logs_data_address_from_with_zeros.replace(/^0x0+/, "0x");
        address_from = logs_data_address_from_without_zeros;

        // Address with leading zeros
        const logs_data_address_to_with_zeros = transaction_data.result.logs[0].topics[2];
        // Remove leading zeros
        const logs_data_address_to_without_zeros = logs_data_address_to_with_zeros.replace(/^0x0+/, "0x");
        address_to = logs_data_address_to_without_zeros;


        // Address with leading zeros
        const logs_data_contract_address = transaction_data.result.logs[0].address;
        // set contract address
        contract_address = logs_data_contract_address;
        //transaction_hash_blockchain from blockchain
        request_id = transaction_data.result.logs[0].transactionHash;
        transaction_hash_blockchain = transaction_data.result.logs[0].transactionHash;
        
        
    }


    // STEP - Check if contract address is supported


    if (contract_address) { // Meaning it is token transaction, so check if it is allowed token
        const contract_address_lowercase = contract_address.toLowerCase();
        const allowed_bep20_contract_address = await getAllowedDepositContract(contract_deposit_filename);

        // Check if the contract_address exists in the allowed_bep20_contract_address array
        const contract_data = allowed_bep20_contract_address.find(obj => obj.hasOwnProperty(contract_address_lowercase));

        if (!contract_data) {
          const response = {
            status: false,
            status_code: 400,
            message: `Contract address ${contract_address} not found in allowed contracts.`,
            error: { 
                    error_data: {
                        token_tx_amount_wei: token_tx_amount_wei,
                        address_from : address_from,
                        address_to : address_to,
                        contract_address : contract_address,
                        transaction_hash : transaction_hash,
                        }
                    }
          };
          convertBigIntToInt(response);
          return res.send(response);
        }
   
        token_decimal_int = contract_data[contract_address_lowercase].token_decimal;
        amount = parseFloat(token_tx_amount_wei) / Math.pow(10, token_decimal_int);

        const rimplenet_backend_wallet_id_to_deposit_to_user_wallet = contract_data[contract_address_lowercase].rimplenet_backend_wallet_id_to_deposit_to_user_wallet;
        
        if(rimplenet_backend_wallet_id_to_deposit_to_user_wallet){//It means wallet_id is set on contract info
            // Set wallet_id
            wallet_id = rimplenet_backend_wallet_id_to_deposit_to_user_wallet;
        }
        else {
            const response = {
                status: false,
                status_code: 400,
                message: `Rimplenet Deposit wallet id ${rimplenet_backend_wallet_id_to_deposit_to_user_wallet} not specified on contract info.`,
                error: { 
                        error_data: {
                            from_address : from_address,
                            contract_address : contract_address,
                            rimplenet_backend_wallet_id_to_deposit_to_user_wallet : rimplenet_backend_wallet_id_to_deposit_to_user_wallet
                            }
                        }
            };
            convertBigIntToInt(response);
            return res.send(response);
        }

    }


    // STEP - Check if address_to exist
    const address_to_lowercase = address_to.toLowerCase();
    const user_meta_url = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/utils/check-if-meta-value-exists?meta_key=eth_crypto_wallet_deposit_address&meta_value=${address_to_lowercase}`;
    console.log(user_meta_url);
    const user_meta_url_response = await axios.get(user_meta_url);

    if (!user_meta_url_response.data.data.eth_crypto_wallet_deposit_address.meta_value === address_to_lowercase) {
        const response = {
            status: false,
            status_code: 404,
            message: `Address ${address} does not exist in the app`
        };

        return res.send(response);
    }
    const user_id = user_meta_url_response.data.data.eth_crypto_wallet_deposit_address.user_id || 0;


    //STEP withdraw to Central Address

    let withdraw_to_central_address_response, credit_to_app;
    if (scan==="bnb_txn") {   

       try{
            const withdraw_token_to_central_address_response = await withdrawUserBNBtoCentralAddress(user_id, address_to_lowercase);
            withdraw_to_central_address_response = withdraw_token_to_central_address_response;
            if(withdraw_to_central_address_response.status || withdraw_to_central_address_response.error.error_type==='user_address_bnb_zero_balance'){
               credit_to_app = true; 
            }
            else{
               credit_to_app = false; 
            }

       }
      catch (error) {    
            withdraw_to_central_address_response = error; // Throw other errors to be caught by the outer catch block
       }


    }
    else{
       try{
            const withdraw_token_to_central_address_response = await withdrawUserBEP20toCentralAddress(user_id, address_to_lowercase, contract_address);
            withdraw_to_central_address_response = withdraw_token_to_central_address_response;
            if(withdraw_to_central_address_response.status || withdraw_to_central_address_response.error.error_type==='user_address_token_zero_balance'){
               credit_to_app = true; 

            }
            else{
               credit_to_app = false; 
            }
      }
      catch (error) {    
            withdraw_to_central_address_response = error; // Throw other errors to be caught by the outer catch block
       }

    }

    

    let app_credit_response_data, credit_exists;
    if (transaction_hash===transaction_hash_blockchain && request_id && wallet_id && amount && credit_to_app) {

        try {
            const credit_url = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/rimplenet/v1/credits`;

            // Send credit request to the backend
            const credit_response = await axios.post(credit_url, {
                request_id: request_id,
                user_id: user_id,
                wallet_id: wallet_id,
                amount: amount,
                note: `Deposit Recieved - ${transaction_hash}`,
                meta_data: {

                    "transaction_hash": transaction_hash,
                    "blockchain_deposit_transaction_hash": transaction_hash_blockchain,

                    "transaction_action_type": "bscscan_deposit",
                    "transaction_type_category": "blockchain_deposit",
                    "transaction_external_processor": "bscscan.com",
                    "transaction_approval_status": "middleware_processed",
                    "transaction_approval_method": "admin_middleware",
                    "transaction_approved_by": "admin"
                }
            }, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY
                }
            });

            app_credit_response_data = credit_response.data;
            credit_exists = app_credit_response_data.data.transaction_id;
        } catch (error) {
            if (error.response && error.response.status === 409) {
                app_credit_response_data = error.response.data;
                credit_exists = app_credit_response_data.error.txn_id;

            } else {
                throw error; // Throw other errors to be caught by the outer catch block
            }
        }
    }
    else{
        app_credit_response_data = {
                                    "status" : false ,
                                    "status_code" : 400 ,
                                    "message": "Incomplete Request Params",
                                    "error": {
                                        "error_data" :  {"credit_to_app" : credit_to_app,
                                                        "transaction_hash" : transaction_hash,
                                                        "transaction_hash_blockchain" :  transaction_hash_blockchain,
                                                        "request_id" :  request_id,
                                                        "wallet_id" : wallet_id,
                                                        "amount" : amount
                                                    }
                                        }
                                };
    }

    let status, message;
    if(credit_exists){
        status = true;
        message = `Transaction successfully credited to user at transaction - #${credit_exists}`;
    }
    else if(credit_to_app===false){
        status = false;
        message = `Transaction timeout while moving funds to central address, try again`;
    }
    else{
        status = false;
        message = `Incomplete Parameters while crediting user, try switching scan_type or coin_type`;
    }



        const response = {
            status: status,
            status_code: 200,
            message: message,
            data: { 
                    app_credit_response : app_credit_response_data,  
                    request_id: request_id,
                    user_id : user_id,
                    wallet_id: wallet_id,
                    amount: amount,
                    address_from : address_from,
                    address_to : address_to,
                    contract_address : contract_address,
                    transaction_hash : transaction_hash,
                    transaction_hash_blockchain : transaction_hash_blockchain,
                    transaction_data : transaction_data,
                    withdraw_to_central_address_response : withdraw_to_central_address_response,
                    }
        };

        return res.send(response);
     
    } catch (error) {
        // Handle errors using custom error handling middleware
        handleTryCatchError(res, error);
    }
});

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
module.exports = router;

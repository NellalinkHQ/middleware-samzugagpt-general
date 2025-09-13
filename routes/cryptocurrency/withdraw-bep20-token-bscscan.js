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

// BEP20 Token Contract Address Mapping with Decimals
// Add new tokens here by mapping wallet_id to { address, decimals }
const BEP20_TOKEN_CONTRACTS = {
    // Mainnet contracts
    mainnet: {
        'usdt': { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
        'usdt_staking_interest': { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
        'usdc': { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 }, // USDC on BSC
        'busd': { address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18 }, // BUSD on BSC
        'dai': { address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', decimals: 18 }, // DAI on BSC
        'eth': { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 }, // ETH on BSC
        'btc': { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18 }, // BTCB on BSC
        'bnb': { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 }, // WBNB on BSC
        'szcb': { address: '0x702371e0897f5e2f566b1ce8256856d0549c5857', decimals: 8 }, // SZCB on BSC
        'szcb2': { address: '0xb4e62a01909f49fc30de2bf92f3a554f2f636360', decimals: 18 }, // SZCB2 on BSC
        'szcbii': { address: '0xfd0310733a6718167834c1fcdffdedb80b44e9d3', decimals: 18 }, // SZCBII on BSC
        'hhc': { address: '0x6cf3cce0b577516bbc63828743e0e75ab41f1c01', decimals: 18 }, // HHC on BSC
        // Add more tokens as needed
    },
    // Testnet contracts
    testnet: {
        'usdt': { address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', decimals: 18 },
        'usdc': { address: '0x64544969ed7EBf5f083679233325356EbE738930', decimals: 18 }, // USDC on BSC Testnet
        'busd': { address: '0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7', decimals: 18 }, // BUSD on BSC Testnet
        // Add more testnet tokens as needed
    }
};

let web3_http, web3_wss, abiFilePathtoABI;
try {
    if (MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK === "testnet") {
        web3_http = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET}`);
        web3_wss = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET}`);
        abiFilePathtoABI = path.join(__dirname, 'contract-abi', 'bscscan-testnet', 'bep20_abi.json');
    } else {
        web3_http = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET}`);
        web3_wss = new Web3(`${MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET}`);
        abiFilePathtoABI = path.join(__dirname, 'contract-abi', 'bscscan-mainnet', 'bep20_abi.json');
    }
} catch (error) { 
    console.error("Error occurred while initializing ENV providers:", error.message);
}

router.put('/approve/:transactionID', async function(req, res, next) {
    try {
        // Function to serialize BigInt
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
            }
        });

        const blockchain_withdrawal_address_to = transactionDetailsResponse.data.data.blockchain_withdrawal_address_to;
        if (!blockchain_withdrawal_address_to) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Blockchain Withdrawal Address to was not set",
                error: {
                    message: `Blockchain Withdrawal Address to was not set`,
                    recommendation: "Set Withdrawal Address to",
                    error_data: blockchain_withdrawal_address_to
                }
            });
        }

        // Validate that the withdrawal address is a valid EVM address
        if (!web3_http.utils.isAddress(blockchain_withdrawal_address_to)) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Invalid wallet address format",
                error: {
                    message: `The withdrawal address "${blockchain_withdrawal_address_to}" is not a valid EVM address`,
                    recommendation: "Provide a valid EVM address (0x followed by 40 hexadecimal characters)",
                    error_data: {
                        provided_address: blockchain_withdrawal_address_to,
                        address_length: blockchain_withdrawal_address_to ? blockchain_withdrawal_address_to.length : 0
                    }
                }
            });
        }

        const amount = transactionDetailsResponse.data.data.amount;
        if (!amount || amount <= 0) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Invalid Amount, amount less than or equal to 0",
                error: {
                    message: `Invalid Amount, amount less than or equal to 0`,
                    recommendation: "Amount should be positive",
                    error_data: amount
                }
            });
        }

        const wallet_id = transactionDetailsResponse.data.data.currency;
        if (!wallet_id) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Invalid wallet_id",
                error: {
                    message: `Invalid wallet_id specified`,
                    recommendation: "wallet_id should be specified",
                    error_data: wallet_id
                }
            });
        }

        // Get token info for the token and network
        const tokenInfo = getTokenInfo(wallet_id, MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK);
        if (!tokenInfo) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Unsupported token",
                error: {
                    message: `Token ${wallet_id} is not supported`,
                    recommendation: `Add ${wallet_id} to BEP20_TOKEN_CONTRACTS mapping`,
                    error_data: {
                        token: wallet_id,
                        network: MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK,
                        supported_tokens: Object.keys(BEP20_TOKEN_CONTRACTS[MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK] || {})
                    }
                }
            });
        }

        const contractAddress = tokenInfo.address;
        const tokenDecimals = tokenInfo.decimals;

        const privateKey = MODULE1_CRYPTOCURRENCY_WITHDRAWAL_ADDRESS_FROM_PRIVATE_KEY;
        const fromAddress = MODULE1_CRYPTOCURRENCY_WITHDRAWAL_ADDRESS_FROM;
        const toAddress =  blockchain_withdrawal_address_to;

        // Convert amount to token's smallest unit
        const amountInTokenWei = convertToTokenWei(amount, wallet_id, MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK);
        
        // Validate that amountInTokenWei is not empty or invalid
        if (!amountInTokenWei || amountInTokenWei === '' || amountInTokenWei === '0') {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: "Invalid amount conversion",
                error: {
                    message: `Failed to convert amount ${amount} to token wei for ${wallet_id}`,
                    recommendation: "Check amount value and token decimals configuration",
                    error_data: {
                        amount: amount,
                        wallet_id: wallet_id,
                        amountInTokenWei: amountInTokenWei,
                        tokenDecimals: getTokenDecimals(wallet_id, MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK)
                    }
                }
            });
        }

        // Check BNB balance for gas fees
        const gasPrice = await web3_http.eth.getGasPrice();
        const gasFeesWei = gasPrice * BigInt(21000n);

        const bnbBalance = await web3_http.eth.getBalance(fromAddress);
        const bnbBalanceInEther = web3_http.utils.fromWei(bnbBalance, 'ether');
        const bnbBalanceWei = BigInt(bnbBalance);

        if (bnbBalanceWei < gasFeesWei) {
            const response = {
                status: false,
                status_code: 400,
                message: 'Insufficient Provider BNB balance for GAS Fee',
                error: { 
                    "bnbBalanceInEther": bnbBalanceInEther,
                    "bnbBalanceWei": bnbBalanceWei,
                    "requiredGasFee": gasFeesWei.toString()
                }
            };

            convertBigIntToInt(response);
            return res.status(400).send(response);
        }

        // Get token contract and check balance
        const tokenAbi = await getBEP20Abi();
        const tokenContract = new web3_http.eth.Contract(tokenAbi, contractAddress);

        const balanceResponse = await tokenContract.methods.balanceOf(fromAddress).call();
        const balanceInTokenWei = balanceResponse;

        if (BigInt(balanceInTokenWei) < BigInt(amountInTokenWei)) {
            const response = {
                status: false,
                status_code: 400,
                message: `Insufficient Provider ${wallet_id.toUpperCase()} balance`,
                error: { 
                    "amount": amount,
                    "amountInTokenWei": amountInTokenWei,
                    "balanceInTokenWei": balanceInTokenWei,
                    "balanceInToken": convertFromTokenWei(balanceInTokenWei, wallet_id, MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK),
                    "fromAddress": fromAddress,
                    "contractAddress": contractAddress,
                    "toAddress": toAddress,
                    "token": wallet_id,
                    "tokenDecimals": tokenDecimals
                }
            };

            convertBigIntToInt(response);
            return res.status(400).send(response);
        }

        // Approve the withdrawal transaction
        const approvalResult = await approveWithdrawalTransaction(transactionID, user_id, meta_data);

        if (approvalResult.status != true) {
            return res.status(400).send(approvalResult);
        }

        // Prepare and send the transaction
        const gasLimit = '500000'; // Gas limit for the transaction

        const data = tokenContract.methods.transfer(toAddress, amountInTokenWei).encodeABI();
        const nonce = await web3_http.eth.getTransactionCount(fromAddress);

        const txObject = {
            from: fromAddress,
            to: contractAddress,
            gas: gasLimit,
            gasPrice: gasPrice,
            data: data,
            nonce: nonce
        };

        const signedTx = await web3_http.eth.accounts.signTransaction(txObject, privateKey);
        const receipt = await web3_http.eth.sendSignedTransaction(signedTx.rawTransaction);
        convertBigIntToInt(receipt);
        
        const transaction_withdrawal_payment_from_address = receipt.from;
        const transaction_hash = receipt.transactionHash;
        const block_number = receipt.blockNumber;

        let transaction_verification_url;
        if (MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK === "testnet") {
            transaction_verification_url = `https://testnet.bscscan.com/tx/${transaction_hash}`;
        } else {
            transaction_verification_url = `https://bscscan.com/tx/${transaction_hash}`;
        }

        // Update transaction with blockchain details
        const updateTransactionUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${transactionID}`;
        const updateTransactionRequestBody = {
            ...meta_data,
            "blockchain_transaction_hash": transaction_hash,
            "blockchain_block_number": block_number,
            "blockchain_from_address": transaction_withdrawal_payment_from_address,
            "blockchain_to_address": toAddress,
            "blockchain_processor_network": MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK,
            "blockchain_transaction_type_category": "withdrawals",
            "blockchain_transaction_action_type": `blockchain_bscscan_withdrawal_${wallet_id}_bep20`,
            "transaction_processor": "middleware",
            "transaction_external_processor": "bscscan",
            "transaction_verification_url": transaction_verification_url,
            "token_contract_address": contractAddress,
            "token_symbol": wallet_id.toUpperCase(),
            "token_decimals": tokenDecimals,
            "amount_in_token_wei": amountInTokenWei
        };

        const updateTransactionResponse = await axios.put(updateTransactionUrl, updateTransactionRequestBody, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
            }
        });

        let response = {
            status: true,
            status_code: 200,
            message: `${wallet_id.toUpperCase()} Transaction Approved Successfully`,
            data: {
                approval_result: approvalResult,
                receipt: receipt,
                update_transaction_response: updateTransactionResponse.data,
                transaction_details: {
                    token: wallet_id.toUpperCase(),
                    amount: amount,
                    amount_in_token_wei: amountInTokenWei,
                    from_address: fromAddress,
                    to_address: toAddress,
                    contract_address: contractAddress,
                    transaction_hash: transaction_hash,
                    verification_url: transaction_verification_url
                }
            }
        };

        return res.json(response);

    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

/**
 * Get BEP20 token ABI (using the same ABI for all BEP20 tokens)
 */
async function getBEP20Abi() {
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

/**
 * Get supported tokens for the current network
 */
router.get('/supported-tokens', async function(req, res, next) {
    try {
        const supportedTokens = BEP20_TOKEN_CONTRACTS[MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK] || {};
        const tokenList = Object.keys(supportedTokens).map(token => ({
            symbol: token.toUpperCase(),
            contract_address: supportedTokens[token].address,
            decimals: supportedTokens[token].decimals,
            network: MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK
        }));

        return res.json({
            status: true,
            status_code: 200,
            message: "Supported BEP20 tokens retrieved successfully",
            data: {
                network: MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK,
                tokens: tokenList,
                total_tokens: tokenList.length
            }
        });
    } catch (error) {
        handleTryCatchError(res, error);
    }
});


/**
/**
 * Get contract address for a given token and network
 * @param {string} tokenSymbol - The token symbol (e.g., 'usdt', 'usdc')
 * @param {string} network - The network ('mainnet' or 'testnet')
 * @returns {string|null} Contract address or null if not found
 */
function getTokenContractAddress(tokenSymbol, network) {
    const networkContracts = BEP20_TOKEN_CONTRACTS[network];
    if (!networkContracts) {
        return null;
    }
    const tokenInfo = networkContracts[tokenSymbol.toLowerCase()];
    return tokenInfo ? tokenInfo.address : null;
}

/**
 * Get token decimals for a given token and network
 * @param {string} tokenSymbol - The token symbol
 * @param {string} network - The network ('mainnet' or 'testnet')
 * @returns {number} Token decimals (default: 18)
 */
function getTokenDecimals(tokenSymbol, network) {
    const networkContracts = BEP20_TOKEN_CONTRACTS[network];
    if (!networkContracts) {
        return 18; // Default
    }
    const tokenInfo = networkContracts[tokenSymbol.toLowerCase()];
    return tokenInfo ? tokenInfo.decimals : 18; // Default to 18 if not found
}

/**
 * Get token info (address and decimals) for a given token and network
 * @param {string} tokenSymbol - The token symbol
 * @param {string} network - The network ('mainnet' or 'testnet')
 * @returns {object|null} Token info object with address and decimals, or null if not found
 */
function getTokenInfo(tokenSymbol, network) {
    const networkContracts = BEP20_TOKEN_CONTRACTS[network];
    if (!networkContracts) {
        return null;
    }
    const tokenInfo = networkContracts[tokenSymbol.toLowerCase()];
    return tokenInfo ? tokenInfo : null;
}

/**
 * Convert amount to token's smallest unit (wei equivalent)
 * @param {string|number} amount - Amount in token units
 * @param {string} tokenSymbol - Token symbol
 * @param {string} network - The network ('mainnet' or 'testnet')
 * @returns {string} Amount in smallest unit
 */
function convertToTokenWei(amount, tokenSymbol, network) {
    const decimals = getTokenDecimals(tokenSymbol, network);
    const amountInWei = web3_http.utils.toWei(amount.toString(), 'ether');
    
    // If decimals are 18, return the full wei amount
    if (decimals === 18) {
        return amountInWei;
    }
    
    // For other decimals, adjust by slicing
    return amountInWei.slice(0, -18 + decimals);
}

/**
 * Convert amount from token's smallest unit to token units
 * @param {string} amountInWei - Amount in smallest unit
 * @param {string} tokenSymbol - Token symbol
 * @param {string} network - The network ('mainnet' or 'testnet')
 * @returns {string} Amount in token units
 */
function convertFromTokenWei(amountInWei, tokenSymbol, network) {
    const decimals = getTokenDecimals(tokenSymbol, network);
    
    // If decimals are 18, use the amount directly
    if (decimals === 18) {
        return web3_http.utils.fromWei(amountInWei, 'ether');
    }
    
    // For other decimals, pad with zeros
    return web3_http.utils.fromWei(amountInWei + '0'.repeat(18 - decimals), 'ether');
}

module.exports = router;

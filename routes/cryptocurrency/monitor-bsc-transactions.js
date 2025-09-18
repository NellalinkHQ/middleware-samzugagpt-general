const { ethers } = require("ethers");
const axios = require('axios');

// Import EVM address management functions
const { getEvmMonitoredAddresses } = require('./manage-evm-monitored-addresses');

// Import cryptocurrency utils to get user_id from address and utility functions
const { 
    getAddressMetaData, 
    withdrawUserBEP20toCentralAddress, 
    pushUserBEP20TransactionstoUserWallet,
    withdrawUserBNBtoCentralAddress,
    pushUserBNBTransactionstoUserWallet
} = require('./utils');
const MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK.toLowerCase();
let wsProvider, httpProvider;

if (MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK === "testnet") {
    // 🔗 Providers
    wsProvider = new ethers.WebSocketProvider(
      process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_TESTNET || "wss://bsc-testnet.publicnode.com"
    );

    httpProvider = new ethers.JsonRpcProvider(
      process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_TESTNET || "https://data-seed-prebsc-1-s1.binance.org:8545"
    );

} else {
    wsProvider = new ethers.WebSocketProvider(
      process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_WSS_MAINNET 
    );

    httpProvider = new ethers.JsonRpcProvider(
      process.env.MODULE1_CRYPTOCURRENCY_NODE_PROVIDER_HTTP_MAINNET 
    );
}


/**
 * 🔁 BEP-20 Transfers Monitor (using WebSocket)
 */
function monitorBEP20Transfers() {

  const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

  wsProvider.on(
    {
      address: null,
      topics: [TRANSFER_TOPIC],
    },
    (log) => {
      try {
        const from = `0x${log.topics[1].slice(26)}`.toLowerCase();
        const to = `0x${log.topics[2].slice(26)}`.toLowerCase();

        if (!log.data || log.data === "0x") {
          throw new Error("Empty or invalid data in token transfer log");
        }

       // console.log(`\n💠 BEP-20 Token Scanning!`);

        const value = ethers.toBigInt(log.data);

        if (getMonitoredAddresses().includes(to)) {
          console.log(`\n💠 BEP-20 Token Deposit Detected!`);
          console.log(`📥 From: ${from}`);
          console.log(`➡️ To: ${to}`);
          console.log(`🔗 Token Contract: ${log.address}`);
          console.log(`🔗 Tx Hash: ${log.transactionHash}`);
          console.log(
            `💸 Amount: ${ethers.formatUnits(value, 18)} (assumes 18 decimals)`
          );
          
          // Process BEP20 token directly (non-blocking)
          processBEP20Transaction(to, log.address, log.transactionHash).catch(error => {
            console.error(`❌ Error processing BEP20 transaction:`, error.message);
          });
        }
      } catch (err) {
        //console.error("⚠️ Error BEP20 Monitor:", err.message);
      }
    }
  );
}

/**
 * 💰 BNB Native Transfer Monitor (using HTTP provider)
 */
function monitorBNBDeposits() {
  wsProvider.on("block", async (blockNumber) => {
    // console.log(`\n🔍 Scanning block: ${blockNumber}`);
    try {
      const block = await httpProvider.getBlock(blockNumber);
      for (const txHash of block.transactions) {
        const tx = await httpProvider.getTransaction(txHash);
        if (tx.to && getMonitoredAddresses().includes(tx.to.toLowerCase())) {
          console.log(`\n💰 Native BNB Deposit Detected!`);
          console.log(`➡️ To: ${tx.to}`);
          console.log(`🔗 Tx Hash: ${tx.hash}`);
          console.log(`📦 Block: ${blockNumber}`);
          console.log(`💸 Amount: ${ethers.formatEther(tx.value)} BNB`);
          
          // Process BNB transaction directly (non-blocking)
          processBNBTransaction(tx.to.toLowerCase(), tx.hash).catch(error => {
            console.error(`❌ Error processing BNB transaction:`, error.message);
          });
        }
      }
    } catch (err) {
      //console.error("⚠️ Error BNB Monitor:", err.message);
    }
  });
}



// Function to get user_id from address
async function getUserIdFromAddress(address) {
  try {
    const userMetaUrl = `${process.env.MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/utils/check-if-meta-value-exists?meta_key=eth_crypto_wallet_deposit_address&meta_value=${address.toLowerCase()}`;
    const userMetaUrlResponse = await axios.get(userMetaUrl);
    
    if (userMetaUrlResponse.data.data.eth_crypto_wallet_deposit_address.meta_value === address.toLowerCase()) {
      return userMetaUrlResponse.data.data.eth_crypto_wallet_deposit_address.user_id || null;
    }
    return null;
  } catch (error) {
    console.error(`❌ Error getting user_id for address ${address}:`, error.message);
    return null;
  }
}

// Function to process BEP20 token transaction
async function processBEP20Transaction(userAddress, tokenContract, txHash) {
  // Check if there's already a processing task for this address
  if (processingQueue.has(userAddress)) {
    console.log(`⏳ Address ${userAddress} is already being processed, queuing BEP20 transaction`);
    // Wait for the existing processing to complete
    await processingQueue.get(userAddress);
  }
  
  // Create a new processing promise
  const processingPromise = processBEP20TransactionInternal(userAddress, tokenContract, txHash);
  processingQueue.set(userAddress, processingPromise);
  
  try {
    await processingPromise;
  } finally {
    // Remove from queue when done
    processingQueue.delete(userAddress);
  }
}

// Internal BEP20 processing function
async function processBEP20TransactionInternal(userAddress, tokenContract, txHash) {
  try {
    console.log(`🔄 Processing BEP20 transaction for address: ${userAddress}`);
    
    // Get user_id from address
    const userId = await getUserIdFromAddress(userAddress);
    
    if (!userId) {
      console.log(`⚠️ No user_id found for address: ${userAddress}`);
      return;
    }
    
    console.log(`👤 Found user_id: ${userId} for address: ${userAddress}`);
    
    // Get user address from user_id
    const user_address_meta = await getAddressMetaData(userId);
    const user_address = user_address_meta.data.address;
    
    console.log(`🔄 Withdrawing BEP20 token to central address: ${tokenContract}`);
    
    // Withdraw token to central address
    const withdrawResult = await withdrawUserBEP20toCentralAddress(userId, user_address, tokenContract);
    
    //console.log(`🔄 Withdraw BEP20 Result:`, withdrawResult);

    if (withdrawResult.status === true) {
      console.log(`✅ BEP20 token withdrawal successful, now pushing transactions to user wallet`);
      
      // Push token to user wallet
      const pushResult = await pushUserBEP20TransactionstoUserWallet(userId, user_address, tokenContract);
      
      // console.log(`🔄 Push BEP20 Result:`, pushResult);
      console.log(`✅ BEP20 token processing completed for user_id: ${userId}`);
    } else {
      console.log(`❌ BEP20 token withdrawal failed for user_id: ${userId}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing BEP20 transaction for ${userAddress}:`, error.message);
  }
}

// Function to process BNB transaction
async function processBNBTransaction(userAddress, txHash) {
  // Check if there's already a processing task for this address
  if (processingQueue.has(userAddress)) {
    console.log(`⏳ Address ${userAddress} is already being processed, queuing BNB transaction`);
    // Wait for the existing processing to complete
    await processingQueue.get(userAddress);
  }
  
  // Create a new processing promise
  const processingPromise = processBNBTransactionInternal(userAddress, txHash);
  processingQueue.set(userAddress, processingPromise);
  
  try {
    await processingPromise;
  } finally {
    // Remove from queue when done
    processingQueue.delete(userAddress);
  }
}

// Internal BNB processing function
async function processBNBTransactionInternal(userAddress, txHash) {
  try {
    console.log(`🔄 Processing BNB transaction for address: ${userAddress}`);
    
    // Get user_id from address
    const userId = await getUserIdFromAddress(userAddress);
    
    if (!userId) {
      console.log(`⚠️ No user_id found for address: ${userAddress}`);
      return;
    }
    
    console.log(`👤 Found user_id: ${userId} for address: ${userAddress}`);
    
    // Get user address from user_id
    const user_address_meta = await getAddressMetaData(userId);
    const user_address = user_address_meta.data.address;
    
    console.log(`🔄 Processing BNB`);
    
    // Withdraw BNB to central address
    const withdrawBNBResult = await withdrawUserBNBtoCentralAddress(userId, user_address);
    //console.log(`🔄 Withdraw BNB Result:`, withdrawBNBResult);
    if (withdrawBNBResult.status === true) {
      console.log(`✅ BNB withdrawal successful, now pushing transactions to user wallet`);
      
      // Push BNB to user wallet
      const pushBNBResult = await pushUserBNBTransactionstoUserWallet(userId, user_address);

      //console.log(`🔄 Push BNB Result:`, pushBNBResult);
      console.log(`✅ BNB processing completed for user_id: ${userId}`);
    } else {
      console.log(`❌ BNB withdrawal failed for user_id: ${userId}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing BNB transaction for ${userAddress}:`, error.message);
  }
}


// Processing queue to handle concurrent transactions
const processingQueue = new Map(); // address -> Promise

// Get monitored addresses from EVM management system
function getMonitoredAddresses() {
  return getEvmMonitoredAddresses();
}

console.log("📡 Monitoring the following addresses on BSC:");
getMonitoredAddresses().forEach((addr) => console.log(`🟢 ${addr}`));

// 🔄 Start both monitors
function startMonitoringBSCTransactions() {
  monitorBEP20Transfers();
  monitorBNBDeposits();
}


module.exports = { 
  startMonitoringBSCTransactions
};
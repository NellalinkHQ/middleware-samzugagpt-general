const { ethers } = require("ethers");
const axios = require('axios');

// Import EVM address management functions
const { getEvmMonitoredAddresses } = require('./manage-evm-address');

// Import cryptocurrency utils to get user_id from address and utility functions
const { 
    getAddressMetaData, 
    withdrawUserBEP20toCentralAddress, 
    pushUserBEP20TransactionstoUserWallet,
    withdrawUserBNBtoCentralAddress,
    pushUserBNBTransactionstoUserWallet,
    getAllBep20TokenAddresses
} = require('../utils');
const MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK = process.env.MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK.toLowerCase();
let wsProvider, httpProvider;

// Initialize providers with error handling
function initializeProviders() {
  try {
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

    // Add error handlers for WebSocket provider
    wsProvider.on('error', (error) => {
      console.error('❌ WebSocket Provider Error:', error.message);
      // Don't restart immediately, let it handle reconnection
    });

    // Handle connection state changes (ethers.js v6 compatible)
    wsProvider._websocket?.addEventListener('close', () => {
      console.log('🔌 WebSocket connection closed, attempting to reconnect...');
    });

    wsProvider._websocket?.addEventListener('open', () => {
      console.log('✅ WebSocket connection established');
      console.log('🔍 WebSocket ready state:', wsProvider._websocket?.readyState);
    });

    wsProvider._websocket?.addEventListener('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });

    console.log(`🌐 Initialized providers for ${MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK} network`);
    
  } catch (error) {
    console.error('❌ Failed to initialize providers:', error.message);
    throw error;
  }
}

// Initialize providers
initializeProviders();


/**
 * 🔁 BEP-20 Transfers Monitor (using WebSocket)
 */
function monitorBEP20Transfers() {
  try {
    // Update monitor status
    monitorStatus.bep20Monitor.running = true;
    monitorStatus.bep20Monitor.startedAt = new Date().toISOString();


    // Use proper ethers.js v6 event filtering syntax
    const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
    
    // Get all unique BEP20 token addresses from utils
    const uniqueTokenAddresses = getAllBep20TokenAddresses(MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK);
    
  
    const filter = {
      address: uniqueTokenAddresses, // Use unique token addresses from utils
      topics: [TRANSFER_TOPIC]
    };
    
    console.log(`🔍 Setting up filter for 📊 Monitoring ${uniqueTokenAddresses.length} unique BEP20 token addresse:`, filter);

    
    wsProvider.on(filter, (log) => {
     
      // Update last activity
      monitorStatus.bep20Monitor.lastActivity = new Date().toISOString();
      try {

        if (!log.data || log.data === "0x") { 
          throw new Error("Empty or invalid data in token transfer log");
        }

        const iface = new ethers.Interface([
          "event Transfer(address indexed from, address indexed to, uint256 value)"
        ]);
        const { from, to, value } = iface.parseLog(log).args;
       

        

        // 👇 Convert to lowercase
        const fromAddress = from.toLowerCase();
        const toAddress = to.toLowerCase();
        const contractAddress = log.address.toLowerCase();
        const transactionHash = log.transactionHash;
        

        if (getMonitoredAddresses().includes(toAddress)) {

          // Log the transaction details
          console.log(`\n💠 BEP-20 Token Deposit Detected!::`, {
            from: fromAddress,
            to: toAddress,
            contractAddress: contractAddress,
            value: value,
            topics: log.topics,
            data: log.data,
            transactionHash: transactionHash
          });
          console.log(
            `💸 Amount: ${ethers.formatUnits(value, 18)} (assumes 18 decimals)`
          );
          
          // Process BEP20 token directly (non-blocking)
          processBEP20Transaction(toAddress, contractAddress, transactionHash).catch(error => {
            console.error(`❌ Error processing BEP20 transaction:`, error.message);
          });
        }
      } catch (err) {
        console.error("⚠️ Error BEP20 Monitor:", err.message);
        console.error("⚠️ Error details:", err);
      }
    });

    console.log('✅ BEP-20 Monitor started successfully');
  } catch (error) {
    console.error('❌ Failed to start BEP-20 Monitor:', error.message);
    monitorStatus.bep20Monitor.running = false;
  }
}

/**
 * 💰 BNB Native Transfer Monitor (using HTTP provider)
 */
function monitorBNBDeposits() {
  try {
    // Update monitor status
    monitorStatus.bnbMonitor.running = true;
    monitorStatus.bnbMonitor.startedAt = new Date().toISOString();

    wsProvider.on("block", async (blockNumber) => {
      // Update last activity
      monitorStatus.bnbMonitor.lastActivity = new Date().toISOString();
      
      // console.log(`\n🔍 BNB Monitor Scanning block: ${blockNumber}`);

      try {
        const block = await httpProvider.getBlock(blockNumber, true);
        if (!block.transactions || block.transactions.length === 0) {
          // 👌 perfectly normal on some blocks
          console.log(`ℹ️ Block ${blockNumber} has no transactions`);
          
        }
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
        //console.error("⚠️ Error details:", err);
      }
    });

    console.log('✅ BNB Monitor started successfully');
  } catch (error) {
    console.error('❌ Failed to start BNB Monitor:', error.message);
    monitorStatus.bnbMonitor.running = false;
  }
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

// Monitor status tracking
let monitorStatus = {
  bep20Monitor: {
    running: false,
    startedAt: null,
    lastActivity: null
  },
  bnbMonitor: {
    running: false,
    startedAt: null,
    lastActivity: null
  }
};

// Get monitored addresses from EVM management system
function getMonitoredAddresses() {
  return getEvmMonitoredAddresses();
}

console.log("📡 Monitoring the following addresses on BSC:");
getMonitoredAddresses().forEach((addr) => console.log(`🟢 ${addr}`));

// 🔄 Start both monitors with retry logic
function startMonitoringBSCTransactions() {
  try {
    console.log('🚀 Starting BSC transaction monitoring...');
    
    // Wait a bit for providers to be ready
    setTimeout(() => {
      monitorBEP20Transfers();
      monitorBNBDeposits();
    }, 5000); // Wait 5 seconds for WebSocket to connect
    
  } catch (error) {
    console.error('❌ Failed to start BSC monitoring:', error.message);
    
    // Retry after 5 seconds
    setTimeout(() => {
      console.log('🔄 Retrying BSC monitoring startup...');
      startMonitoringBSCTransactions();
    }, 5000);
  }
}

// Function to get monitor status
function getMonitorStatus() {
  return {
    status: true,
    status_code: 200,
    message: "Monitor status retrieved successfully",
    data: {
      monitors: {
        bep20: {
          running: monitorStatus.bep20Monitor.running,
          started_at_formatted: monitorStatus.bep20Monitor.startedAt ? new Date(monitorStatus.bep20Monitor.startedAt).toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }) : null,
          started_at: monitorStatus.bep20Monitor.startedAt,
          last_activity: monitorStatus.bep20Monitor.lastActivity,
          description: "BEP-20 Token Transfer Monitor"
        },
        bnb: {
          running: monitorStatus.bnbMonitor.running,
          started_at_formatted: monitorStatus.bnbMonitor.startedAt ? new Date(monitorStatus.bnbMonitor.startedAt).toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }) : null,
          started_at: monitorStatus.bnbMonitor.startedAt,
          last_activity: monitorStatus.bnbMonitor.lastActivity,
          description: "BNB Native Transfer Monitor"
        }
      },
      network: MODULE1_CRYPTOCURRENCY_BSCSCAN_NETWORK,
      monitored_addresses_count: getMonitoredAddresses().length,
      processing_queue_size: processingQueue.size
    }
  };
}


// Add global error handlers for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit the process, just log the error
});

// Auto-start BSC monitoring when this module is loaded
console.log('🚀 Auto-starting BSC monitoring from monitor-bsc-transactions module...');
startMonitoringBSCTransactions();

module.exports = { 
  startMonitoringBSCTransactions,
  getMonitorStatus
};
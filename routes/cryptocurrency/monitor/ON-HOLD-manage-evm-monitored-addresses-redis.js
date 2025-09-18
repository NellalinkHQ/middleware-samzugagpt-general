const express = require('express');
const router = express.Router();
const { ethers } = require("ethers");
const redis = require('redis');

// 🔗 Redis client setup
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0
});

// Redis key for EVM addresses
const EVM_ADDRESSES_KEY = 'evm_monitored_addresses';

// Initialize Redis connection
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Connected to Redis');
  // Initialize with default addresses
  initializeDefaultAddresses();
});

// Initialize default addresses in Redis
async function initializeDefaultAddresses() {
  try {
    const defaultAddresses = [
      "0x9BaCAE40B87D1C9856707DF3b3EEee6D8b786D5d",
    ].map((addr) => addr.toLowerCase());
    
    // Check if addresses already exist
    const existingCount = await redisClient.sCard(EVM_ADDRESSES_KEY);
    if (existingCount === 0) {
      // Add default addresses
      await redisClient.sAdd(EVM_ADDRESSES_KEY, defaultAddresses);
      console.log(`✅ Initialized Redis with ${defaultAddresses.length} default EVM addresses`);
    }
  } catch (error) {
    console.error('❌ Failed to initialize default addresses:', error);
  }
}

// 🔧 Redis-based EVM address management functions
async function addEvmMonitoredAddress(address) {
  const normalizedAddress = address.toLowerCase();
  if (ethers.isAddress(normalizedAddress)) {
    try {
      const result = await redisClient.sAdd(EVM_ADDRESSES_KEY, normalizedAddress);
      if (result === 1) {
        console.log(`✅ Added new EVM address to Redis: ${normalizedAddress}`);
        return { status: true, address: normalizedAddress, message: "EVM address added successfully" };
      } else {
        console.log(`ℹ️ EVM address already exists in Redis: ${normalizedAddress}`);
        return { status: true, address: normalizedAddress, message: "EVM address already exists" };
      }
    } catch (error) {
      console.error(`❌ Redis error adding address ${normalizedAddress}:`, error);
      return { status: false, address: address, message: "Failed to add address to Redis" };
    }
  } else {
    console.log(`❌ Invalid EVM address format: ${address}`);
    return { status: false, address: address, message: "Invalid EVM address format" };
  }
}

async function removeEvmMonitoredAddress(address) {
  const normalizedAddress = address.toLowerCase();
  try {
    const result = await redisClient.sRem(EVM_ADDRESSES_KEY, normalizedAddress);
    if (result === 1) {
      console.log(`🗑️ Removed EVM address from Redis: ${normalizedAddress}`);
      return { status: true, address: normalizedAddress, message: "EVM address removed successfully" };
    } else {
      console.log(`❌ EVM address not found in Redis: ${address}`);
      return { status: false, address: address, message: "EVM address not found in Redis" };
    }
  } catch (error) {
    console.error(`❌ Redis error removing address ${normalizedAddress}:`, error);
    return { status: false, address: address, message: "Failed to remove address from Redis" };
  }
}

async function getEvmMonitoredAddresses() {
  try {
    const addresses = await redisClient.sMembers(EVM_ADDRESSES_KEY);
    return addresses || [];
  } catch (error) {
    console.error('❌ Redis error getting addresses:', error);
    return [];
  }
}

async function isEvmAddressMonitored(address) {
  const normalizedAddress = address.toLowerCase();
  try {
    const result = await redisClient.sIsMember(EVM_ADDRESSES_KEY, normalizedAddress);
    return result === 1;
  } catch (error) {
    console.error(`❌ Redis error checking address ${normalizedAddress}:`, error);
    return false;
  }
}

async function getEvmAddressCount() {
  try {
    const count = await redisClient.sCard(EVM_ADDRESSES_KEY);
    return count || 0;
  } catch (error) {
    console.error('❌ Redis error getting address count:', error);
    return 0;
  }
}

/**
 * GET /cryptocurrency/manage-evm-monitored-addresses-redis/addresses
 * Get all EVM monitored addresses
 */
router.get('/addresses', async (req, res) => {
  try {
    const addresses = await getEvmMonitoredAddresses();
    const count = await getEvmAddressCount();
    
    res.json({
      status: true,
      status_code: 200,
      message: `Successfully retrieved ${count} EVM monitored addresses from Redis`,
      data: {
        count: count,
        addresses: addresses,
        type: 'EVM',
        storage: 'Redis'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      status_code: 500,
      message: 'Failed to retrieve EVM monitored addresses from Redis',
      error: error.message
    });
  }
});

/**
 * POST /cryptocurrency/manage-evm-monitored-addresses-redis/addresses/add
 * Add a new EVM address to monitoring
 */
router.post('/addresses/add', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({
        status: false,
        status_code: 400,
        message: 'EVM address is required',
        error: 'Missing address parameter'
      });
    }

    const result = await addEvmMonitoredAddress(address);
    
    if (result.status) {
      const totalCount = await getEvmAddressCount();
      res.json({
        status: true,
        status_code: 200,
        message: result.message,
        data: {
          address: result.address,
          totalMonitored: totalCount,
          type: 'EVM',
          storage: 'Redis'
        }
      });
    } else {
      res.status(400).json({
        status: false,
        status_code: 400,
        message: result.message,
        error: {
          address: result.address,
          reason: 'Invalid EVM address format or Redis error'
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      status: false,
      status_code: 500,
      message: 'Failed to add EVM address to Redis',
      error: error.message
    });
  }
});

/**
 * DELETE /cryptocurrency/manage-evm-monitored-addresses-redis/addresses/remove
 * Remove an EVM address from monitoring
 */
router.delete('/addresses/remove', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({
        status: false,
        status_code: 400,
        message: 'EVM address is required',
        error: 'Missing address parameter'
      });
    }

    const result = await removeEvmMonitoredAddress(address);
    
    if (result.status) {
      const totalCount = await getEvmAddressCount();
      res.json({
        status: true,
        status_code: 200,
        message: result.message,
        data: {
          address: result.address,
          totalMonitored: totalCount,
          type: 'EVM',
          storage: 'Redis'
        }
      });
    } else {
      res.status(404).json({
        status: false,
        status_code: 404,
        message: result.message,
        error: {
          address: result.address,
          reason: 'EVM address not found in Redis'
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      status: false,
      status_code: 500,
      message: 'Failed to remove EVM address from Redis',
      error: error.message
    });
  }
});

/**
 * GET /cryptocurrency/manage-evm-monitored-addresses-redis/addresses/check/:address
 * Check if an EVM address is being monitored
 */
router.get('/addresses/check/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address) {
      return res.status(400).json({
        status: false,
        status_code: 400,
        message: 'EVM address parameter is required',
        error: 'Missing address parameter'
      });
    }

    const isMonitored = await isEvmAddressMonitored(address);
    
    res.json({
      status: true,
      status_code: 200,
      message: isMonitored ? 'EVM address is being monitored in Redis' : 'EVM address is not being monitored in Redis',
      data: {
        address: address.toLowerCase(),
        isMonitored: isMonitored,
        type: 'EVM',
        storage: 'Redis'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      status_code: 500,
      message: 'Failed to check EVM address status in Redis',
      error: error.message
    });
  }
});

/**
 * GET /cryptocurrency/manage-evm-monitored-addresses-redis/stats
 * Get Redis statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const count = await getEvmAddressCount();
    const memoryUsage = await redisClient.memory('usage', EVM_ADDRESSES_KEY);
    
    res.json({
      status: true,
      status_code: 200,
      message: 'Redis statistics retrieved successfully',
      data: {
        addressCount: count,
        memoryUsageBytes: memoryUsage,
        memoryUsageMB: Math.round(memoryUsage / 1024 / 1024 * 100) / 100,
        storage: 'Redis',
        type: 'EVM'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      status_code: 500,
      message: 'Failed to get Redis statistics',
      error: error.message
    });
  }
});

module.exports = {
  router,
  getEvmMonitoredAddresses
};

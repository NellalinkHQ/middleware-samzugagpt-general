const express = require('express');
const router = express.Router();
const { ethers } = require("ethers");

/**
 * GET /cryptocurrency/manage-addresses/evm/addresses
 * Get all EVM monitored addresses
 */
router.get('/', (req, res) => {
  try {
    const addresses = getEvmMonitoredAddresses();
    res.json({
      status: true,
      status_code: 200,
      message: `Successfully retrieved ${addresses.length} EVM monitored addresses`,
      data: {
        count: addresses.length,
        addresses: addresses,
        type: 'EVM'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      status_code: 500,
      message: 'Failed to retrieve EVM monitored addresses',
      error: error.message
    });
  }
});

/**
 * POST /cryptocurrency/manage-evm-monitored-addresses/add
 * Add a new EVM address to monitoring
 */
router.post('/add', (req, res) => {
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

    const result = addEvmMonitoredAddress(address);
    
    if (result.status) {
      res.json({
        status: true,
        status_code: 200,
        message: result.message,
        data: {
          address: result.address,
          totalMonitored: getEvmMonitoredAddresses().length,
          type: 'EVM'
        }
      });
    } else {
      res.status(400).json({
        status: false,
        status_code: 400,
        message: result.message,
        error: {
          address: result.address,
          reason: 'Invalid EVM address format'
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      status: false,
      status_code: 500,
      message: 'Failed to add EVM address',
      error: error.message
    });
  }
});

/**
 * DELETE /cryptocurrency/manage-evm-monitored-addresses/remove
 * Remove an EVM address from monitoring
 */
router.delete('/remove', (req, res) => {
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

    const result = removeEvmMonitoredAddress(address);
    
    if (result.status) {
      res.json({
        status: true,
        status_code: 200,
        message: result.message,
        data: {
          address: result.address,
          totalMonitored: getEvmMonitoredAddresses().length,
          type: 'EVM'
        }
      });
    } else {
      res.status(404).json({
        status: false,
        status_code: 404,
        message: result.message,
        error: {
          address: result.address,
          reason: 'EVM address not found in monitoring list'
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      status: false,
      status_code: 500,
      message: 'Failed to remove EVM address',
      error: error.message
    });
  }
});

/**
 * GET /cryptocurrency/manage-evm-monitored-addresses/check/:address
 * Check if an EVM address is being monitored
 */
router.get('/check/:address', (req, res) => {
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

    const isMonitored = isEvmAddressMonitored(address);
    
    res.json({
      status: true,
      status_code: 200,
      message: isMonitored ? 'EVM address is being monitored' : 'EVM address is not being monitored',
      data: {
        address: address.toLowerCase(),
        isMonitored: isMonitored,
        type: 'EVM'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      status_code: 500,
      message: 'Failed to check EVM address status',
      error: error.message
    });
  }
});


// 🧍 Independent EVM address storage
let evmMonitoredAddresses = new Set([
  "0x9BaCAE40B87D1C9856707DF3b3EEee6D8b786D5d",
].map((addr) => addr.toLowerCase()));

// 🔧 Independent EVM address management functions
function addEvmMonitoredAddress(address) {
  const normalizedAddress = address.toLowerCase();
  if (ethers.isAddress(normalizedAddress)) {
    evmMonitoredAddresses.add(normalizedAddress);
    console.log(`✅ Added new EVM address to monitoring: ${normalizedAddress}`);
    return { status: true, address: normalizedAddress, message: "EVM address added successfully" };
  } else {
    console.log(`❌ Invalid EVM address format: ${address}`);
    return { status: false, address: address, message: "Invalid EVM address format" };
  }
}

function removeEvmMonitoredAddress(address) {
  const normalizedAddress = address.toLowerCase();
  if (evmMonitoredAddresses.has(normalizedAddress)) {
    evmMonitoredAddresses.delete(normalizedAddress);
    console.log(`🗑️ Removed EVM address from monitoring: ${normalizedAddress}`);
    return { status: true, address: normalizedAddress, message: "EVM address removed successfully" };
  } else {
    console.log(`❌ EVM address not found in monitoring list: ${address}`);
    return { status: false, address: address, message: "EVM address not found in monitoring list" };
  }
}

function getEvmMonitoredAddresses() {
  return Array.from(evmMonitoredAddresses);
}

function isEvmAddressMonitored(address) {
  return evmMonitoredAddresses.has(address.toLowerCase());
}


module.exports = {
  router,
  getEvmMonitoredAddresses,
  addEvmMonitoredAddress
};

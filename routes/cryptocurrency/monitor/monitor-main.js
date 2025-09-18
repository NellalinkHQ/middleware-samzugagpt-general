const express = require('express');
const router = express.Router();

// Import management functions
const { 
  getEvmMonitoredAddresses, 
  addEvmMonitoredAddress, 
  removeEvmMonitoredAddress, 
  isEvmAddressMonitored
} = require('./manage-evm-address');

// Import monitor status function
const { getMonitorStatus } = require('./monitor-bsc-transactions');

/**
 * GET /monitor/status/bsc
 * Returns the current status of BNB and BEP20 monitors
 */
router.get('/status/bsc', async (req, res) => {
  try {
    const status = getMonitorStatus();
    res.status(status.status_code).json(status);
  } catch (error) {
    console.error('❌ Error getting monitor status for BSC - BNB and BEP20:', error.message);
    res.status(400).json({
      status: false,
      status_code: 400,
      message: "Failed to retrieve monitor status for BSC BNB and BEP20",
      error: error.message
    });
  }
});

/**
 * GET /monitor/evm/addresses
 * Get all EVM monitored addresses
 */
router.get('/evm/addresses', (req, res) => {
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
 * POST /monitor/evm/addresses/add
 * Add a new EVM address to monitoring
 */
router.post('/evm/addresses/add', (req, res) => {
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
 * DELETE /monitor/evm/addresses/remove
 * Remove an EVM address from monitoring
 */
router.delete('/evm/addresses/remove', (req, res) => {
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
 * GET /monitor/evm/addresses/check/:address
 * Check if an EVM address is being monitored
 */
router.get('/evm/check/:address', (req, res) => {
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

module.exports = {
  router
};

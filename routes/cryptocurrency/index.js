var express = require('express');
var router = express.Router();

/* BSCSCAN - Monitor deposited USDT  */
router.use('/bscscan/deposit-address', require('./generate-deposit-address'));

/* BSCSCAN - Withdraw User USDT  */
router.use('/bscscan/withdrawal', require('./withdraw-bep20-token-bscscan'));

/* ADMIN TRIGGER - Deposit to App by Transaction Hash */
router.use('/admin/bscscan/withdraw', require('./bscscan-deposit-by-transaction-hash'));

/* MANAGE EVM MONITORED ADDRESSES */
router.use('/manage-evm-monitored-addresses', require('./manage-evm-monitored-addresses').router);

// Start BSC monitoring when the module is loaded
const { startMonitoringBSCTransactions } = require('./monitor-bsc-transactions');
startMonitoringBSCTransactions();

module.exports = router;
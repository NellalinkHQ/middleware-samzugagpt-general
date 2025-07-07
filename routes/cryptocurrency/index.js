var express = require('express');
var router = express.Router();



/* BSCSCAN - Monitor deposited USDT  */
router.use('/bscscan/deposit-address', require('./generate-crypto-deposit-address'));

/* BSCSCAN - Monitor deposited USDT  */
router.use('/bscscan/deposit-usdt', require('./bscscan-deposit-usdt'));

/* BSCSCAN - Withdraw User USDT  */
router.use('/bscscan/withdrawal/usdt', require('./bscscan-approve-user-withdrawal-usdt'));

/* BSCSCAN - Monitor / Withdraw deposited BNB to Central Address */
router.use('/bscscan/bnb/withdraw-deposited-transactions-to-central-address', require('./bscscan-bnb-actions-withdraw-deposited-transactions-to-central-address.js'));
/* BSCSCAN - Lists, Push / Credit BNB Transactions to App after Central Address Withdrawal */
router.use('/bscscan/bnb/actions-after-central-address-withdrawal', require('./bscscan-bnb-actions-after-central-address-withdrawal.js'));

/* BSCSCAN - Monitor / Withdraw deposited BEP20 Tokens to Central Address */
router.use('/bscscan/bep20/withdraw-deposited-transactions-to-central-address', require('./bscscan-bep20-actions-withdraw-deposited-transactions-to-central-address.js'));
/* BSCSCAN - Lists, Push / Credit BEP20 Transactions to App after Central Address Withdrawal */
//router.use('/bscscan/bnb/actions-after-central-address-withdrawal', require('./bscscan-bnb-actions-after-central-address-withdrawal.js'));

/* BSCSCAN - Withdraw deposited USDT to Central Address */
router.use('/bscscan/withdraw-deposited-usdt-to-central-address', require('./bscscan-withdraw-deposited-usdt-to-central-address.js'));


/* ADMIN - Withdraw by Transaction Hash */
router.use('/admin/bscscan/withdraw', require('./endpoint-admin-bscscan-deposit-by-transaction-hash'));

module.exports = router;
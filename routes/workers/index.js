var express = require('express');
var router = express.Router();


/* Process Crypto Balances to Central Address to App */
router.use('/cryptocurrency/wallet-balances/deposit-to-app', require('./process-cryto-wallet-balance-to-app'));

/* Submit PK and Address to Samfield */
router.use('/cryptocurrency/submit-to-watcher', require('./submit-to-watcher'));



module.exports = router;
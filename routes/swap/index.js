var express = require('express');
var router = express.Router();

// Import userJWT-TokenSecurity middleware
const userJWTSecurityCheck= require('../../middleware-utils/user-jwt-token-security-validation');

/* Update Swap Rate */
router.use('/rate-setting', userJWTSecurityCheck, require('./update-swap-rate'));

/* Perform User Wallet Balance Swap */
router.use('/user-wallet-balance', userJWTSecurityCheck, require('./user-wallet-balance-swap'));

/* Get Conversion Rate */
router.use('/conversion-rate', userJWTSecurityCheck, require('./conversion-rate'));



module.exports = router;

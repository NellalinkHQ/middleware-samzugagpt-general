var express = require('express');
var router = express.Router();

// Import userJWT-TokenSecurity middleware
const userJWTSecurityCheck= require('../../middleware-utils/user-jwt-token-security-validation');

/* Referral Bonus Settings */
// router.use('/rate-setting', userJWTSecurityCheck, require('./update-swap-rate'));

/* Perform User Referral Bonus Paymenet */
router.use('/pay-referrer-sponsor-bonus', userJWTSecurityCheck, require('./pay-referrer-sponsor-bonus'));


module.exports = router;

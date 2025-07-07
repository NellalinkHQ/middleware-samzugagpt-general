var express = require('express');
var router = express.Router();

// Import userJWT-TokenSecurity middleware
const userJWTSecurityCheck= require('../../middleware-utils/user-jwt-token-security-validation');

/* Request Withdrawal */
router.use('/request', userJWTSecurityCheck, require('./request-withdrawal'));

/* Approve Withdrawal */
router.use('/approve', require('./approve-withdrawal'));

/* Decline Withdrawal */
router.use('/decline', require('./decline-withdrawal'));


module.exports = router;
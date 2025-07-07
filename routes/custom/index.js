var express = require('express');
var router = express.Router();

// Import userJWT-TokenSecurity middleware
const userJWTSecurityCheck= require('../../middleware-utils/user-jwt-token-security-validation');

/* Trigger - User Login Success */
router.use('/samzugagpt/trigger/on-user-login/success', userJWTSecurityCheck, require('./trigger-user-login-success'));

/* Trigger - Balance Refresh */
router.use('/samzugagpt/trigger/on-user-frontend-dashboard-refresh', userJWTSecurityCheck, require('./trigger-user-frontend-dashboard-refresh'));

/* Trigger - Referral Page Refresh */
router.use('/samzugagpt/trigger/on-user-frontend-referral-refresh', userJWTSecurityCheck, require('./trigger-user-frontend-referral-refresh'));


/* Custom - Debit User */
router.use('/debit-user', userJWTSecurityCheck, require('./debit-user'));

/* Transfer - with fees */
router.use('/transfer-with-fees', userJWTSecurityCheck, require('./transfer-with-fees'));

module.exports = router;

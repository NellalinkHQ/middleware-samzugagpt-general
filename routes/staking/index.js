var express = require('express');
var router = express.Router();

// Import userJWT-TokenSecurity middleware
const userJWTSecurityCheck= require('../../middleware-utils/user-jwt-token-security-validation');

/* Create Staking */
router.use('/', userJWTSecurityCheck, require('./create-staking'));

/* Get Staking Details*/
router.use('/', userJWTSecurityCheck, require('./get-staking'));

/* Withdraw Acuumulated Staking ROI */
router.use('/withdraw-roi', userJWTSecurityCheck, require('./staking-withdraw-roi-enhanced'));

/* Withdraw Staking Capital */
router.use('/withdraw-capital', userJWTSecurityCheck, require('./staking-withdraw-capital'));

/* Get Accumulated Staking ROI */
router.use('/accumulated-roi', userJWTSecurityCheck, require('./staking-accumulated-roi'));

/* Get Staking Total Interest Balance */
router.use('/total-accumulated-roi', userJWTSecurityCheck, require('./staking-accumulated-roi-total-balance'));


/* Index */
router.get('/', function(req, res, next) {

 let messages = {
  1: {
    id: '1',
    text: 'Hello World',
    userId: '1',
  },
  2: {
    id: '2',
    text: 'By World',
    userId: '2',
  },
};
  res.send(messages);
});

module.exports = router;

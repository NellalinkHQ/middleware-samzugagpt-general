var express = require('express');
var router = express.Router();

// Import userJWT-TokenSecurity middleware
const userJWTSecurityCheck= require('../../middleware-utils/user-jwt-token-security-validation');

/* Create Staking */
router.use('/', userJWTSecurityCheck, require('./create-staking'));

/* Plan 1, 2, 3, 4 Staking */
router.use('/plan-1', userJWTSecurityCheck, require('./create-staking/plan-1'));
router.use('/plan-2', userJWTSecurityCheck, require('./create-staking/plan-2'));
router.use('/plan-3', userJWTSecurityCheck, require('./create-staking/plan-3'));
router.use('/plan-4', userJWTSecurityCheck, require('./create-staking/plan-4'));

/* Get Staking Details*/
router.use('/', userJWTSecurityCheck, require('./get-staking'));

/* Withdraw Acuumulated Staking ROI */
router.use('/withdraw-roi', userJWTSecurityCheck, require('./staking-withdraw-roi'));

/* Withdraw Staking Capital */
router.use('/withdraw-capital', userJWTSecurityCheck, require('./staking-withdraw-capital'));

/* Withdraw Staking Capital */
router.use('/withdraw-capital/plan-1', userJWTSecurityCheck, require('./withdraw-staking-capital/plan-1'));
router.use('/withdraw-capital/plan-2', userJWTSecurityCheck, require('./withdraw-staking-capital/plan-2'));
router.use('/withdraw-capital/plan-3', userJWTSecurityCheck, require('./withdraw-staking-capital/plan-3'));
router.use('/withdraw-capital/plan-4', userJWTSecurityCheck, require('./withdraw-staking-capital/plan-4'));

/* Withdraw Staking ROI */
router.use('/withdraw-roi/plan-1', userJWTSecurityCheck, require('./withdraw-staking-roi/plan-1'));
router.use('/withdraw-roi/plan-2', userJWTSecurityCheck, require('./withdraw-staking-roi/plan-2'));
router.use('/withdraw-roi/plan-3', userJWTSecurityCheck, require('./withdraw-staking-roi/plan-3'));
router.use('/withdraw-roi/plan-4', userJWTSecurityCheck, require('./withdraw-staking-roi/plan-4'));

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

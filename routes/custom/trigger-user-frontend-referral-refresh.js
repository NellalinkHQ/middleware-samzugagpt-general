var express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
var router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());


const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');
const { payReferralBonustoReferrerSponsor, fetchReferredUsers } = require('../referral/utils');

// Get Environment Var set from ENV
const MODULE1_BASE_URL = process.env.MODULE1_BASE_URL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_BASE_USER_JWT_SECRET_KEY = process.env.MODULE1_BASE_USER_JWT_SECRET_KEY;

router.post('/disable-referral-bonus', async function(req, res, next) {
    try {
        // Extracting data from the request body
        const { user_id, meta_data } = req.body;

        //let user_id = parseInt(req.query.user_id) || 0;
        
        // Check if Authorization is added
        if (!req.headers.authorization) {
            const response = {
                status: false,
                status_code: 400,
                message: 'JWT Token required',
                error: { error_data: req.headers.authorization }
            };
            return res.status(400).send(response); // Return response if not added
        }

        // Extract JWT Bearer token from the request headers and remove the Bearer keyword
        const userBearerJWToken = req.headers.authorization.split(' ')[1];
        

        if (!user_id) {
            const response = {
                status: false,
                status_code: 400,
                message: 'user_id required',
                error: { 
                        error_data: {
                            user_id : user_id
                            }
                        }
            };
            return res.status(400).send(response); // Return response if not added
        }
        
        // Pay Referral Bonus to Referrer Sponsor Display
        let payReferralBonustoReferrerSponsorDisplay;
        try {
             const referral_bonus_setting_metas = {               
                                "usdt": { "percentage_for_referrer_sponsor_on_deposit_1": "5%"},
                                "szcb": { "percentage_for_referrer_sponsor_on_deposit_1": "5%"},
                                "szcbii": { "percentage_for_referrer_sponsor_on_deposit_1": "5%"},
                                "hhc": { "percentage_for_referrer_sponsor_on_deposit_1": "5%"},
                                "bnb": { "percentage_for_referrer_sponsor_on_deposit_1": "5%"}
                            };
             payReferralBonustoReferrerSponsorDisplay = await payReferralBonustoReferrerSponsor(user_id, "pattern_1", referral_bonus_setting_metas );

        } catch (error) {
            // Handle error as needed
            console.error('Error in payReferralBonustoReferrerSponsorDisplay request:', error);
            if (error.response && error.response.data) {
                payReferralBonustoReferrerSponsorDisplay = error.response.data;
            } else {
                payReferralBonustoReferrerSponsorDisplay = error;
            }
        }

        // // fetch Referred Users Display
        // let fetchReferredUsersDisplay;
        // try {
        //      fetchReferredUsersDisplay = await fetchReferredUsers(user_id, 5, 1);

        // } catch (error) {
        //     // Handle error as needed
        //     console.error('Error in fetchReferredUsersDisplay request:', error);
        //     if (error.response && error.response.data) {
        //         fetchReferredUsersDisplay = error.response.data;
        //     } else {
        //         fetchReferredUsersDisplay = error;
        //     }
        // }

       
        

        let response = {
            status: true,
            status_code: 200,
            message: "Trigger - Referral Refresh Successful",
            data: {
                pay_referral_bonus_to_referrer_sponsor : payReferralBonustoReferrerSponsorDisplay,
                //referred_users : fetchReferredUsersDisplay,
            }
        };

        return res.send(response);
    } catch (error) {
        // Handle errors using custom error handling middleware
        handleTryCatchError(res, error);
    }
});

module.exports = router;


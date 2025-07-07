const express = require('express');
const axios = require('axios');
const router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Import userWalletBalanceCheck middleware
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');

// Import the utils function 
const { declineWithdrawalTransaction } = require('./utils');

// Set ENV Var
const MODULE1_BASE_URL = process.env.MODULE1_BASE_URL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;

// Endpoint to handle withdrawal approval
router.put('/:transactionID', async (req, res) => {
    try {
        const transactionID = req.params.transactionID;
        const { user_id_performing_request, meta_data } = req.body;

        // Check if Authorization header is included
        const userBearerJWToken = req.headers.authorization?.split(' ')[1];
        if (!userBearerJWToken) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: 'JWT Token required',
                error: { error_data: req.headers.authorization }
            });
        }

        const declineResult = await declineWithdrawalTransaction(transactionID, user_id_performing_request, meta_data);

        return res.status(200).json({
            status: true,
            status_code: 200,
            message: "Withdrawal Declined Successfully",
            data: declineResult
        });
    } catch (error) {
        // Handle errors using custom error handling middleware
        handleTryCatchError(res, error);
    }
});



module.exports = router;

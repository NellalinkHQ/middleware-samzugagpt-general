const axios = require('axios');

//const { handleTryCatchError } = require('../middleware-utils/custom-try-catch-error');


// Check Balance Middleware Function
async function userWalletBalanceCheck(MODULE1_BASE_URL, MODULE1_BASE_API_KEY, userBearerJWToken, user_id, wallet_id, amount) {

    try {
        // Step 1: Check balance of user
        const balanceCheckUrl = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/user-wallet-balance?wallet_id=${wallet_id}&user_id=${user_id}`;
        console.log("balanceCheckUrl", balanceCheckUrl)
        
        let balanceResponse;
        if (!userBearerJWToken) { // userBearerJWToken was not found
            balanceResponse = await axios.get(balanceCheckUrl, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY
                }
            });
        } else {
            balanceResponse = await axios.get(balanceCheckUrl, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
                }
            });
        }


        // Extract user balance, defaulting to 0 if null or empty
        const userBalance = balanceResponse.data.data.wallet_balance_raw || 0;
        
        let response;
        if (userBalance < amount) {
            // Insufficient balance response
            response = {
                status: false,
                status_code: 400,
                message: `Insufficient Wallet Balance in ${wallet_id}`,
                error: {
                    message: `Amount ${amount} is greater than Wallet balance ${userBalance}`,
                    recommendation: "Amount should not be greater than Wallet balance",
                    error_data: balanceResponse.data
                }
            };

        }
        else if (userBalance >= amount) {
            // Sufficient balance response
            response = {
                status: true,
                status_code: 200,
                message: `Sufficient Wallet Balance in ${wallet_id}`,
                data: {
                    //balanceResponse.data
                }
            };

            
        }
        else{
            response = {
                status: false,
                status_code: 400,
                message: `Unknown Balance Check Error in ${wallet_id}`,
                error: {
                    message: `Unknown Balance Check Error`,
                    recommendation: "Please contact administrator ",
                    //error_data: balanceResponse.data
                }
            };
        }

        return response;
    } catch (error) {
        console.error('Error userWalletBalanceCheck:', error);
        throw error; // Throw error for handling at higher level
    }
}


module.exports = userWalletBalanceCheck;
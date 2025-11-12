var express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
var router = express.Router();
const joi = require("joi");

// Middleware to parse JSON bodies
router.use(express.json());

// Import userWalletBalanceCheck middleware
const userWalletBalanceCheckUtils = require('../../middleware-utils/user-wallet-balance-check');
const { handleTryCatchError } = require('../../middleware-utils/custom-try-catch-error');

// Get Environment Var set from ENV
const MODULE1_BASE_URL = process.env.MODULE1_BASE_URL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_BASE_USER_JWT_SECRET_KEY = process.env.MODULE1_BASE_USER_JWT_SECRET_KEY;

// Cache for transfer limits (1 hour TTL)
const transferLimitsCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds



router.post('/', async function(req, res, next) {
    try {
        // Extracting data from the request body
        const { request_id, user_id, amount, wallet_id, meta_key, meta_value, meta_data } = req.body;

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

        // Call validation function
        const validationResult = validationTransferViaUserMeta(req, res, next);
        
        // Check if validation failed
        if (!validationResult.status) {
            return res.status(400).send({
                status_code: 400,
                status: false,
                message: validationResult.message,
                error: validationResult.error,
            });
        }

        // Fetch dynamic transfer limits
        const transferLimits = await fetchTransferLimits(wallet_id, userBearerJWToken);
        const { minimum_transfer_amount, maximum_transfer_amount, transfer_fee, user_id_receiver_transfer_fee, state_fee, user_id_receiver_state_fee, national_fee, user_id_receiver_national_fee } = transferLimits;

        //main deal
        let wallet_id_fee = "szcb2";
        let amount_fee = transfer_fee || 0; // Use 0 if transfer_fee is null
        let min_amount_transfer = minimum_transfer_amount;
        let max_amount_transfer = maximum_transfer_amount;

        if (amount <= 0) {
            let response = {
                status: false,
                status_code: 400,
                message: "Transfer amount must be greater than 0",
                error: {
                    error_data: {
                        amount: amount,
                        min_amount: minimum_transfer_amount === null ? "No minimum" : minimum_transfer_amount,
                        max_amount: maximum_transfer_amount === null ? "No limit" : maximum_transfer_amount
                    }
                }
            };
            return res.status(400).send(response);
        }

        // Only check minimum limit if it's set and greater than 0
        if (minimum_transfer_amount !== null && amount < minimum_transfer_amount) {
            let response = {
                status: false,
                status_code: 400,
                message: `Amount is too low. Minimum allowed is ${minimum_transfer_amount}.`,
                error: {
                    error_data: {
                        amount: amount,
                        min_amount: minimum_transfer_amount,
                        max_amount: maximum_transfer_amount === null ? "No limit" : maximum_transfer_amount
                    }
                }
            };
            return res.status(400).send(response);
        }

        // Only check maximum limit if it's set
        if (maximum_transfer_amount !== null && amount > maximum_transfer_amount) {
            let response = {
                status: false,
                status_code: 400,
                message: `Amount exceeds the maximum allowed. Maximum is ${maximum_transfer_amount}.`,
                error: {
                    error_data: {
                        amount: amount,
                        min_amount: minimum_transfer_amount === null ? "No minimum" : minimum_transfer_amount,
                        max_amount: maximum_transfer_amount
                    }
                }
            };
            return res.status(400).send(response);
        }



        // Step *: Check balance of user for fee (only if fee > 0)
        let balanceCheckResultFee = { status: true }; // Default to success if no fee
        if (amount_fee > 0) {
            balanceCheckResultFee = await userWalletBalanceCheckUtils(MODULE1_BASE_URL, MODULE1_BASE_API_KEY, userBearerJWToken, user_id, wallet_id_fee, amount_fee);
            if (balanceCheckResultFee.status!=true) {
                console.log("balanceCheckResultFee Not Sufficient ", balanceCheckResultFee);
                return res.status(400).send(balanceCheckResultFee);// Return if balance Result Fee is not sufficient
            }
        }


        // Step 1: Check balance of user
        // Create userbalanceCheck middleware with parameters extracted from request body
        const balanceCheckResult = await userWalletBalanceCheckUtils(MODULE1_BASE_URL, MODULE1_BASE_API_KEY, userBearerJWToken, user_id, wallet_id, amount);
        if (balanceCheckResult.status!=true) {
            console.log("balanceCheckResult Not Sufficient ", balanceCheckResult);
            return res.status(400).send(balanceCheckResult);// Return if balance Result is not sufficient
        }

        // Check if user exist on the address
        const user_meta_url = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/user/utils/check-if-meta-value-exists?meta_key=${meta_key}&meta_value=${meta_value}`;
        // const bearerToken = "iamtryingybest";
        const user_meta_response = await axios.get(user_meta_url, {
          headers: {
            "Content-Type": "application/json", // Adjust content type based on your API requirements
          },
        });



        if (!user_meta_response.data.status) {
            let response = {
                            status: false,
                            status_code: 400,
                            message: `User with meta_key ${meta_key} and meta_value ${meta_value} not found`,
                            error: {
                                error_data : {
                                meta_key : meta_key,
                                meta_value : meta_value
                                }
                             }
                           };
            return res.status(400).send(response);
        }
        const user_id_transfer_to = user_meta_response.data.data[meta_key].user_id;

       
        // Step : Debit user fee (only if fee > 0)
        let debit_transaction_response_fee = { status: true }; // Default to success if no fee
        if (amount_fee > 0) {
            const debit_url_fee = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/debits`;
            const debit_fee_request_body = {
                "request_id": `user_to_user_transfer_debit_fee_${request_id}`,
                "user_id": user_id,
                "amount": amount_fee,
                "wallet_id": wallet_id_fee,
                "note": `Fee - Transfer to Internal User`,
                 "meta_data": {
                    "user_id_transfer_from": user_id,
                    "user_id_transfer_to": user_id_transfer_to, //AS WAS RETRIEVED DYNAMICALLY
                    "user_meta_key_transfer_to": meta_key,
                    "user_meta_value_transfer_to": meta_value,
                    "transaction_type_action_type": "user_to_user_transfer_fee",
                    "transaction_type_category": "internal_transfer_fee",
                    "transaction_external_processor": "middleware1_module1",
                    "transaction_approval_status": "user_middleware_processed",
                    "transaction_approval_method": "middleware",
                  },
            };

            const debit_response_fee = await axios.post(debit_url_fee, debit_fee_request_body, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
                }
            });
            debit_transaction_response_fee = debit_response_fee.data;

            console.log(debit_response_fee.data.status);
        }

        let debit_transaction_response;
        if (debit_transaction_response_fee.status) {// meaning debit was successful (or no fee to charge)
   
            // Step 2: Debit user 
            const debit_url = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/debits`;
            const debit_request_body = {
                "request_id": `user_to_user_transfer_debit_${request_id}`,
                "user_id": user_id,
                "amount": amount,
                "wallet_id": wallet_id,
                "note": `Transfer to Internal User`,
                 "meta_data": {
                    "user_id_transfer_from": user_id,
                    "user_id_transfer_to": user_id_transfer_to, //AS WAS RETRIEVED DYNAMICALLY
                    "user_meta_key_transfer_to": meta_key,
                    "user_meta_value_transfer_to": meta_value,
                    "transaction_type_action_type": "user_to_user_transfer",
                    "transaction_type_category": "internal_transfer",
                    "transaction_external_processor": "middleware1_module1",
                    "transaction_approval_status": "user_middleware_processed",
                    "transaction_approval_method": "middleware",
                  },
            };

            const debit_response = await axios.post(debit_url, debit_request_body, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
                }
            });
            debit_transaction_response = debit_response.data;

            console.log(debit_response.data.status);

        }


        let credit_transaction_response;
        if (debit_transaction_response.status) {// meaning debit was true i.e successful
        
            let amount_to_credit = amount;
            if (state_fee > 0) {
                amount_to_credit += state_fee;
            }
            if (national_fee > 0) {
                amount_to_credit += national_fee;
            }

        // Step 3: Credit User
        const credit_url = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/credits`;
        const credit_request_body = {
            "request_id": `user_to_user_transfer_credit_${request_id}`,
            "user_id": user_id_transfer_to,
            "amount": amount_to_credit,
            "wallet_id": wallet_id,
            "note": `Transfer from Internal User`,
             "meta_data": {
                "user_id_transfer_from": user_id,
                "user_id_transfer_to": user_id_transfer_to, //AS WAS RETRIEVED DYNAMICALLY
                "user_meta_key_transfer_to": meta_key,
                "user_meta_value_transfer_to": meta_value,
                "transaction_type_action_type": "user_to_user_transfer",
                "transaction_type_category": "internal_transfer",
                "transaction_external_processor": "middleware1_module1",
                "transaction_approval_status": "user_middleware_processed",
                "transaction_approval_method": "middleware",
              },
        };

        const credit_response = await axios.post(credit_url, credit_request_body, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
            }
        });
        credit_transaction_response = credit_response.data;

        }



        // Step 3: Credit Fee to User 1 (only if fee > 0)
        let credit_transaction_response_fee = { status: true }; // Default to success if no fee
        if (amount_fee > 0) {
            const credit_url_fee = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/credits`;
            const credit_request_body_fee = {
                "request_id": `fee_user_to_user_transfer_credit_${request_id}`,
                "user_id": user_id_receiver_transfer_fee,
                "amount": amount_fee,
                "wallet_id": wallet_id_fee,
                "note": `Fee - Transfer from Internal User`,
                 "meta_data": {
                    "user_id_transfer_from": user_id,
                    "user_id_transfer_to": user_id_transfer_to, //AS WAS RETRIEVED DYNAMICALLY
                    "user_meta_key_transfer_to": meta_key,
                    "user_meta_value_transfer_to": meta_value,
                    "transaction_type_action_type": "fee_user_to_user_transfer",
                    "transaction_type_category": "fee_internal_transfer",
                    "transaction_external_processor": "middleware1_module1",
                    "transaction_approval_status": "user_middleware_processed",
                    "transaction_approval_method": "middleware",
                  },
            };

            const credit_response_fee = await axios.post(credit_url_fee, credit_request_body_fee, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY
                }
            });
            credit_transaction_response_fee = credit_response_fee.data;
        }

        let credit_transaction_response_state = { status: true }; // Default to success if no state fee
        if (state_fee > 0) {
            const credit_url_state = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/credits`;
            const credit_request_body_state = {
                "request_id": `state_user_to_user_transfer_credit_${request_id}`,
                "user_id": user_id_receiver_state_fee,
                "amount": state_fee,
                "wallet_id": wallet_id,
                "note": `State Fee - Transfer from Internal User`,
                "meta_data": {
                    "user_id_transfer_from": user_id,
                    "user_id_transfer_to":  user_id_transfer_to, //AS WAS RETRIEVED DYNAMICALLY
                    "user_meta_key_transfer_to": meta_key,
                    "user_meta_value_transfer_to": meta_value,
                    "transaction_type_action_type": "state_user_to_user_transfer",
                    "transaction_type_category": "state_internal_transfer",
                    "transaction_external_processor": "middleware1_module1",
                    "transaction_approval_status": "user_middleware_processed",
                    "transaction_approval_method": "middleware",
                  },
            };

            const credit_response_state = await axios.post(credit_url_state, credit_request_body_state, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
                }
            });
            credit_transaction_response_state = credit_response_state.data;
        }

        let credit_transaction_response_national = { status: true }; // Default to success if no national fee
        if (national_fee > 0) {
            const credit_url_national = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/credits`;
            const credit_request_body_national = {
                "request_id": `national_user_to_user_transfer_credit_${request_id}`,
                "user_id": user_id_receiver_national_fee,
                "amount": national_fee,
                "wallet_id": wallet_id,
                "note": `National Fee - Transfer from Internal User`,
                "meta_data": {
                    "user_id_transfer_from": user_id,
                    "user_id_transfer_to": user_id_transfer_to, //AS WAS RETRIEVED DYNAMICALLY
                    "user_meta_key_transfer_to": meta_key,
                    "user_meta_value_transfer_to": meta_value,
                    "transaction_type_action_type": "national_user_to_user_transfer",
                    "transaction_type_category": "national_internal_transfer",
                    "transaction_external_processor": "middleware1_module1",
                    "transaction_approval_status": "user_middleware_processed",
                    "transaction_approval_method": "middleware",
                  },
            };

            const credit_response_national = await axios.post(credit_url_national, credit_request_body_national, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY,
                    'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
                }   
            });
            credit_transaction_response_national = credit_response_national.data;
        }


        // Success response
        const response = {
            status: true,
            status_code: 200,
            message: "Internal Transfer Successful",
            data : {
                user_id_from: user_id,
                user_id_to: user_id_transfer_to,
                debit_transaction_response_fee : debit_transaction_response_fee,
                debit_transaction_response : debit_transaction_response,
                credit_transaction_response : credit_transaction_response,
                credit_transaction_response_fee : credit_transaction_response_fee,
                credit_transaction_response_state : credit_transaction_response_state,
                credit_transaction_response_national : credit_transaction_response_national,
                transfer_details: {
                    transfer_amount: amount,
                    transfer_fee: transfer_fee || 0,
                    wallet_id: wallet_id,
                    limits: {
                        minimum: minimum_transfer_amount === null ? "No minimum" : minimum_transfer_amount,
                        maximum: maximum_transfer_amount === null ? "No limit" : maximum_transfer_amount,
                        fee: transfer_fee === null ? "No fee" : transfer_fee
                    }
                }
            }
        };
        return res.send(response);
    } catch (error) {
        // Call the custom error handling function
        handleTryCatchError(res, error);
    }
});

// Define validation function
const validationTransferViaUserMeta = (req, res, next) => {
 try{

    const schema = joi.object({
        request_id: joi.string().required(),
        user_id: joi.number().required(),
        wallet_id: joi.string().required(),
        amount: joi.number().required(),
        meta_key: joi.string().required(),
        meta_value: joi.string().required(),
        meta_data: joi.object().optional()
      });

      const { error } = schema.validate(req.body);

      if (error) {
        let message = error.details[0].message;
        console.log("Validation error message: ", message);
        return {
          status_code: 400,
          status: false,
          message: message,
          error: error,
        };
      }

      return { status: true };


 }
  catch(error){
    let message = error.details[0].message;
        console.log("Validation error message: ", message);
        return {
          status_code: 400,
          status: false,
          message: message,
          error: error,
        };
  }
};

/**
 * Fetch transfer limits dynamically based on wallet_id with 1-hour caching
 * @param {string} wallet_id - The wallet ID to get limits for
 * @param {string} userBearerJWToken - JWT token for authentication
 * @returns {Object} Object containing min, max, and fee amounts
 */
async function fetchTransferLimits(wallet_id, userBearerJWToken) {
    const cacheKey = `transfer_limits_${wallet_id}`;
    const now = Date.now();
    
    // Check cache first
    const cached = transferLimitsCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
        console.log(`Using cached transfer limits for ${wallet_id}`);
        return cached.data;
    }

    try {
        const metaKeys = `transfee_fee_${wallet_id},user_id_receiver_transfer_fee_${wallet_id},state_fee_${wallet_id},user_id_receiver_state_fee_${wallet_id},national_fee_${wallet_id},user_id_receiver_national_fee_${wallet_id},minimum_transfer_amount_${wallet_id},maximum_transfer_amount_${wallet_id}`;
        const url = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/site-wide?meta_key=${metaKeys}`;
        
        const response = await axios.get(url, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
                'Authorization': `Bearer ${userBearerJWToken}`
            },
            timeout: 10000 // 10 second timeout
        });

        const data = response.data.data || {};
        
        // Handle the API response format properly
        // Values can be false (not set), string numbers, or actual numbers
        const getValueOrDefault = (value, type) => {
            if (value === false || value === null || value === undefined || value === '') {
                if (type === 'fee') return null; // No fee to charge
                if (type === 'minimum') return null; // No minimum limit to check
                if (type === 'maximum') return null; // No maximum limit to check
                return null;
            }
            
            const parsed = parseFloat(value);
            if (isNaN(parsed)) {
                if (type === 'fee') return null; // No fee to charge
                if (type === 'minimum') return null; // No minimum limit to check
                if (type === 'maximum') return null; // No maximum limit to check
                return null;
            }
            
            // Handle specific type logic
            if (type === 'fee') {
                return parsed <= 0 ? null : parsed; // Negative, 0, or false = no fee
            }
            if (type === 'minimum') {
                return parsed <= 0 ? null : parsed; // 0 or negative = no minimum limit
            }
            if (type === 'maximum') {
                return parsed <= 0 ? null : parsed; // 0 or negative = no maximum limit
            }
            
            return parsed;
        };
        
        // Extract values with proper handling of false/string values
        const minimum_transfer_amount = getValueOrDefault(data[`minimum_transfer_amount_${wallet_id}`], 'minimum');
        const maximum_transfer_amount = getValueOrDefault(data[`maximum_transfer_amount_${wallet_id}`], 'maximum');
        const transfer_fee = getValueOrDefault(data[`transfee_fee_${wallet_id}`], 'fee');
        const user_id_receiver_transfer_fee = getValueOrDefault(data[`user_id_receiver_transfer_fee_${wallet_id}`], 'fee');
        const state_fee = getValueOrDefault(data[`state_fee_${wallet_id}`], 'fee');
        const user_id_receiver_state_fee = getValueOrDefault(data[`user_id_receiver_state_fee_${wallet_id}`], 'fee');
        const national_fee = getValueOrDefault(data[`national_fee_${wallet_id}`], 'fee');
        const user_id_receiver_national_fee = getValueOrDefault(data[`user_id_receiver_national_fee_${wallet_id}`], 'fee');

        const result = {
            minimum_transfer_amount,
            maximum_transfer_amount,
            transfer_fee,
            user_id_receiver_transfer_fee,
            state_fee,
            user_id_receiver_state_fee,
            national_fee,
            user_id_receiver_national_fee,
            success: true,
            cached_at: new Date().toISOString()
        };

        // Cache the result
        transferLimitsCache.set(cacheKey, {
            data: result,
            timestamp: now
        });

        console.log(`Fetched and cached transfer limits for ${wallet_id}:`, result);
        return result;
    } catch (error) {
        console.error('Error fetching transfer limits:', error);
        
        // Return default values if API call fails
        const fallbackResult = {
            minimum_transfer_amount: null, // No minimum limit
            maximum_transfer_amount: null, // No maximum limit
            transfer_fee: null, // No fee
            user_id_receiver_transfer_fee: null, // No fee user id
            state_fee: null, // No state fee
            user_id_receiver_state_fee: null, // No state fee user id
            national_fee: null, // No national fee
            user_id_receiver_national_fee: null, // No national fee user id
            success: false,
            error: error.message,
            cached_at: new Date().toISOString()
        };

        // Cache the fallback result as well to prevent repeated failed API calls
        transferLimitsCache.set(cacheKey, {
            data: fallbackResult,
            timestamp: now
        });

        return fallbackResult;
    }
}

module.exports = router;

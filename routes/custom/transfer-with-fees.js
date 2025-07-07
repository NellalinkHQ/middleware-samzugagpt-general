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

       let fees = { 
                    usdt_staking_interest: { 
                        transfer_fee: 10,
                        transfer_percentage_discount: 0.1
                    },
                    hcc: { 
                        transfer_fee: 15000,
                        transfer_percentage_discount: 0 // Assuming a value, you need to replace it with the actual value.
                    }
                };

        let amount_with_discount = amount - (amount * fees[wallet_id].transfer_percentage_discount);

        // Correctly accessing the fee based on wallet_id
        let amount_with_fee = amount_with_discount + fees[wallet_id].transfer_fee;

        //main deal
        let wallet_id_fee = "szcb2";
        let amount_fee = 1;
        let min_amount_transfer = 5;
        let max_amount_transfer = 10000;

        if (amount < min_amount_transfer) {
            let response = {
                status: false,
                status_code: 400,
                message: `Amount is too low. Minimum allowed is ${min_amount_transfer}.`,
                error: {
                    error_data: {
                        amount: amount,
                        min_amount: min_amount_transfer,
                        max_amount: max_amount_transfer
                    }
                }
            };
            return res.status(400).send(response);
        }

        if (amount > max_amount_transfer) {
            let response = {
                status: false,
                status_code: 400,
                message: `Amount exceeds the maximum allowed. Maximum is ${max_amount_transfer}.`,
                error: {
                    error_data: {
                        amount: amount,
                        min_amount: min_amount_transfer,
                        max_amount: max_amount_transfer
                    }
                }
            };
            return res.status(400).send(response);
        }



        // Step *: Check balance of user
        // Create userbalanceCheck middleware with parameters extracted from request body
        const balanceCheckResultFee = await userWalletBalanceCheckUtils(MODULE1_BASE_URL, MODULE1_BASE_API_KEY, userBearerJWToken, user_id, wallet_id_fee, amount_fee);
        if (balanceCheckResultFee.status!=true) {
            console.log("balanceCheckResultFee Not Sufficient ", balanceCheckResultFee);
            return res.status(400).send(balanceCheckResultFee);// Return if balance Result Fee is not sufficient
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

       
        // Step : Debit user fee
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
        const debit_transaction_response_fee = debit_response_fee.data;

        console.log(debit_response_fee.data.status);

        let debit_transaction_response;
        if (debit_response_fee.data.status) {// meaning debit was succesdful
   
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

        // Step 3: Credit User
        const credit_url = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/credits`;
        const credit_request_body = {
            "request_id": `user_to_user_transfer_credit_${request_id}`,
            "user_id": user_id_transfer_to,
            "amount": amount,
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



        // Step 3: Credit Fee to User 1
        const credit_url_fee = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/credits`;
        const credit_request_body_fee = {
            "request_id": `fee_user_to_user_transfer_credit_${request_id}`,
            "user_id": 1,
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



        // Success response
        const response = {
            status: true,
            status_code: 200,
            message: "Internal Transfer Successful",
            data : {
                user_id_from: 1,
                user_id_to: user_id_transfer_to,
                debit_transaction_response_fee : debit_transaction_response_fee,
                debit_transaction_response : debit_transaction_response,
                credit_transaction_response : credit_transaction_response,
                credit_transaction_response_fee : credit_transaction_response_fee

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

module.exports = router;

const express = require('express');
const axios = require('axios');


// Initialize ENV 
const MODULE1_BASE_URL = process.env.MODULE1_BASE_URL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_BASE_ALLOWED_WITHDRAWAL_WALLET_ID = process.env.MODULE1_BASE_ALLOWED_WITHDRAWAL_WALLET_ID;

// Function to approve a withdrawal transaction
async function approveWithdrawalTransaction(transactionID, userID, metaData) {
    try {
        // Step: Check if User Transaction ID is admin_pending 
        const transactionStatusCheckUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${transactionID}/utils?action=check_if_meta_value_exists&meta_key=transaction_approval_status&meta_value=pending`;

        const transactionDetailsResponse = await axios.get(transactionStatusCheckUrl, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
               // 'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        const transactionStatus = transactionDetailsResponse.data.data.transaction_approval_status;
        if (transactionStatus !== "pending") {
            throw new Error(`Transaction is no longer on pending status (${transactionStatus})`);
        }

        const transactionOwnerUserID = transactionDetailsResponse.data.data.user_id;

        // Proceed with the Approval process
        const updateTransactionUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${transactionID}`;
        const updateTransactionRequestBody = {
            ...metaData,
            "transaction_approval_method_status": "admin_approved",
            "transaction_approval_status": 'approved',
            "transaction_approved_time": Date.now(),
            "transaction_approved_by": userID,
        };

        const updateTransactionResponse = await axios.put(updateTransactionUrl, updateTransactionRequestBody, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
             // 'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        const updateUserPendingTransactionExistsUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/user/${transactionOwnerUserID}`;
        const updateUserPendingTransactionExistsRequestBody = {
            pending_withdrawal_transaction_exists: "no"
        };

        const updateUserPendingTransactionExistsResponse = await axios.put(updateUserPendingTransactionExistsUrl, updateUserPendingTransactionExistsRequestBody, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
             // 'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        return {
            status: true,
            message: "Withdrawal Approval Successful",
            updateTransactionResponse: updateTransactionResponse.data,
            updateUserPendingTransactionExistsResponse: updateUserPendingTransactionExistsResponse.data
        };
    } catch (error) {
        throw error; // Propagate error to caller for handling
    }
}

// Function to decline a withdrawal transaction
async function declineWithdrawalTransaction(transactionID, user_id_performing_request, metaData) {
    try {
        // Step: Check if User Transaction ID is admin_pending 
        const transactionStatusCheckUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${transactionID}/utils?action=check_if_meta_value_exists&meta_key=transaction_approval_status&meta_value=pending`;

        const transactionDetailsResponse = await axios.get(transactionStatusCheckUrl, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
             // 'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        const transactionStatus = transactionDetailsResponse.data.data.transaction_approval_status;
        if (transactionStatus !== "pending") {
            throw new Error(`Transaction is no longer on pending status (${transactionStatus})`);
        }

        const transactionOwnerUserID = transactionDetailsResponse.data.data.user_id;

        // Proceed with the process
        const updateTransactionUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/content/${transactionID}`;
        const updateTransactionRequestBody = {
            ...metaData,
            "transaction_approval_method_status": "admin_declined",
            "transaction_approval_status": 'declined',
            "transaction_declined_time": Date.now(),
            "transaction_declined_by": user_id_performing_request,
        };

        const updateTransactionResponse = await axios.put(updateTransactionUrl, updateTransactionRequestBody, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
             // 'Authorization': `Bearer ${userBearerJWToken}`
            }
        });

        const updateUserPendingTransactionExistsUrl = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/user/${transactionOwnerUserID}`;
        const updateUserPendingTransactionExistsRequestBody = {
            pending_withdrawal_transaction_exists: "no"
        };

        const updateUserPendingTransactionExistsResponse = await axios.put(updateUserPendingTransactionExistsUrl, updateUserPendingTransactionExistsRequestBody, {
            headers: {
                'x-api-key': MODULE1_BASE_API_KEY,
            // 'Authorization': `Bearer ${userBearerJWToken}`
            }
        });


        // Step Revese the transaction
        let transactionReverseDisplay;
        try {
            const transactionReverseUrl = `${MODULE1_BASE_URL}/wp-json/rimplenet-wallet-addon/v1/reverse-transaction`;
            const transactionReverseBody = {
                    "transaction_id": transactionID,
                    "reversed_by": user_id_performing_request,
                    "note": `Reversal of Withdrawal Request - #${transactionID}`,
                };
            const transactionReverseResponse = await axios.post(transactionReverseUrl, transactionReverseBody, {
                headers: {
                    'x-api-key': MODULE1_BASE_API_KEY,
                 // 'Authorization': `Bearer ${userBearerJWToken}` // Append JWT Bearer token to headers
                }
            });
            transactionReverseDisplay = transactionReverseResponse.data;
        }
        catch (error) {
            // Handle error as needed
            console.error('Error in transactionReverseResponse request:', error);
            if (error.response && error.response.data) {
                transactionReverseDisplay = error.response.data;
            } else {
                transactionReverseDisplay = error;
            }

        }



        return {
            status: true,
            message: "Withdrawal Declined Successfully",
            updateTransactionResponse: updateTransactionResponse.data,
            updateUserPendingTransactionExistsResponse: updateUserPendingTransactionExistsResponse.data,
            transactionReverseResponse : transactionReverseDisplay
        };
    } catch (error) {
        throw error; // Propagate error to caller for handling
    }
}

// Export the router and the function
module.exports = {
    approveWithdrawalTransaction: approveWithdrawalTransaction,
    declineWithdrawalTransaction: declineWithdrawalTransaction
};
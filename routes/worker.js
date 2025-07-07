const express = require('express');
const router = express.Router();
const axios = require('axios');
const { handleTryCatchError } = require('../middleware-utils/custom-try-catch-error');

// Function to send a single swap request
async function sendSwapRequest(url, headers, payload) {
  try {
    const response = await axios.post(url, payload, { headers });
    console.log('Response:', response.data);
    return response.data; // Return response data
  } catch (error) {
    console.error('Error sending swap request:', error);
    throw error; // Throw error to propagate it up
  }
}

// Route handler for '/worker' endpoint
router.get('/worker', async function(req, res, next) {
  try {
    const numRequests = 1; // Number of concurrent requests

    const url = 'http://localhost:3000/swap/user-wallet-balance';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJsb2NhbGhvc3QiLCJpYXQiOjE3MTM5NzY1NzYsImV4cCI6MTcxMzk4MDE3NiwidXNlciI6eyJpZCI6MTAsInVzZXJuYW1lIjoid29jYXgyODc3NyIsInJvbGVzIjpbInN1YnNjcmliZXIiXX19.CDyslzel1BahtKEOMqSqx0FH3oJJquWXJTJmoud4Et4'
    };

    const payload = {
      user_id: "10",
      wallet_id_from: "bnb",
      wallet_id_to: "usdt",
      swap_amount: 0,
      request_id: "1713945067"
    };

    // Array to store promises for each concurrent request
    const requests = [];

    // Push concurrent requests into the array
    for (let i = 0; i < numRequests; i++) {
      requests.push(sendSwapRequest(url, headers, payload));
    }

    // Execute all requests concurrently using Promise.all()
    const responses = await Promise.all(requests);

    // Send aggregated responses back as JSON
    res.status(200).json({ responses });
  } catch (error) {
    console.error('Error on worker:', error);
    // Call the custom error handling function
    handleTryCatchError(res, error);
  }
});

module.exports = router;

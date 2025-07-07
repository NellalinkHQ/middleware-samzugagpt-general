const jwt = require('jsonwebtoken');

// JWT token middleware
const middlewareSecurityValidationUserBearerJWToken = (req, res, next) => {
    const MODULE1_BASE_USER_JWT_SECRET_KEY = process.env.MODULE1_BASE_USER_JWT_SECRET_KEY;

    if (!req.headers.authorization) {
        const response = {
            status: false,
            status_code: 400,
            message: 'JWT Token Authorization required',
            error: {error_data: req.headers.authorization}
        };
        return res.status(400).send(response);
    }

    const userBearerJWToken = req.headers.authorization.split(' ')[1];
    // Decode or verify the JWT token based on the presence of MODULE1_STAKING_USER_JWT_SECRET_KEY
    let decodedToken;
    if (!MODULE1_BASE_USER_JWT_SECRET_KEY || MODULE1_BASE_USER_JWT_SECRET_KEY.trim() === '') {
        decodedToken = jwt.decode(userBearerJWToken);
    } else {
        decodedToken = jwt.verify(userBearerJWToken, MODULE1_BASE_USER_JWT_SECRET_KEY);
    }

    // Check if the decoded token exists
    if (!decodedToken) {
        const response = {
            status: false,
            status_code: 400,
            message: 'Invalid or missing JWT token',
            error: {error_data:userBearerJWToken}
        };
        return res.status(400).send(response);
    }

    // Check if the token is expired
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (decodedToken.exp && currentTimestamp > decodedToken.exp) {
        const response = {
            status: false,
            status_code: 400,
            message: 'Expired JWT token',
            error: {error_data:userBearerJWToken}
        };
        return res.status(400).send(response);
    }

    // Extract user_id from the request body
    let user_id;

    // Check if user_id exists in the request body
    if (req.body && req.body.user_id) {
        user_id = req.body.user_id;
    } else if (req.query && req.query.user_id) {
        //If user_id doesn't exist in the request body, check if it exists in the query parameters
        user_id = req.query.user_id;
    } else {
        // If user_id doesn't exist in both request body and query parameters, default it to 0
        user_id = 0;
    }
    

    // Check if the user ID in the token matches the user ID in the request body
    if (decodedToken.user && decodedToken.user.id != user_id) {
        const response = {
            status: false,
            status_code: 400,
            message: 'User ID in JWT token does not match the request',
            error: {error_data:userBearerJWToken}
        };
        return res.status(400).send(response);
    }

    // If all checks pass, proceed to the next middleware/route handler
    next();
};

module.exports = middlewareSecurityValidationUserBearerJWToken;
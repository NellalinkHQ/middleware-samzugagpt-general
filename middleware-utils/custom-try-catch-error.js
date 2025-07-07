// Custom error handling function
function handleTryCatchError(res, error) {
    console.error('Error:', error);
    let status_code, error_message, error_info ;
    if (error.response && error.response.data) {

        //Error Message Setting
        if(error.response.data.message){
            error.message = error.response.data.message +" - "+error.message;
        }

        //Error Message Setting
        if (error.response.status ) {
            status_code = error.response.status;   
        }
        else{
            status_code = 400;
        }

        //Error data setting
        error_info = error.response.data;

    } else {
        status_code = 400
        error_info = error;
    }

    if (!res.headersSent) { // Check if headers have already been sent
        const response = {
            status: false,
            status_code: status_code || 400,
            message: error.message || "Internal Error",
            error: error_info
        };

        return res.status(status_code).send(response);
    } else {
        console.error('Headers already sent, cannot send header again.', error);
    }
}

module.exports = { handleTryCatchError }; // Exporting app and handleTryCatchError function

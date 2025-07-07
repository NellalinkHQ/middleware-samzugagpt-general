var express = require('express');
const axios = require('axios');
const bip39 = require('bip39');
const hdkey = require("hdkey");
const ethUtil = require("ethereumjs-util");
var router = express.Router();

const MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL = process.env.MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL;
const MODULE1_CRYPTOCURRENCY_MNEMONIC = process.env.MODULE1_CRYPTOCURRENCY_MNEMONIC;

/* GET User Deposit Address */
router.get('/:user_id', async function(req, res, next) {

    try {
        const user_id = parseInt(req.params.user_id) || 0;

        // Extracting param key value from the request param
        let generate_mnemonic = req.query.generate_mnemonic || '';

        //Initialize Variables
       let generated_mnemonic, userMetaUrlResponse1, address_to_check_res, address_checksum_res, updateUserCryptoAddressResponse, response;

       if(generate_mnemonic==="yes" && user_id===0){
        //This means this request is to generate MNEMMOIC
        generated_mnemonic = bip39.generateMnemonic(); //generates string
        sample_response = {
                        status: true,
                        status_code: 200,
                        message: `MNEMONIC Generated Successfully`,
                        data: {
                            "generated_mnemonic": generated_mnemonic,
                        }
                    };
        //Response is sent back to browser using at the end of this function
        }
       else{

        const mnemonic = MODULE1_CRYPTOCURRENCY_MNEMONIC; //generates string
        //console.log("MNEMONIC: " + mnemonic);
        const seed = async () => {
            const testseed = await bip39.mnemonicToSeed(mnemonic); //creates seed buffer
            return testseed;
        };
        const testseed = await seed();
        const root = hdkey.fromMasterSeed(testseed);
        const masterPrivateKey = root.privateKey.toString("hex");
        const addrNode = root.derive("m/44'/60'/0'/0/" + user_id); //you can change the last 0 for different account
        const pubKey = ethUtil.privateToPublic(addrNode._privateKey);
        const address = "0x" + ethUtil.publicToAddress(pubKey).toString("hex");
        const address_checksum = ethUtil.toChecksumAddress(address);
        const privateKeyGen = addrNode._privateKey.toString('hex');
        // console.log("===================================================");
        // console.log("User - " + user_id);
        // console.log("Address: " + address);
        // console.log("Private Key: " + privateKeyGen);
        privateKeyShow = privateKeyGen;

        address_to_check_res = address;
        address_checksum_res = address_checksum;
        const userMetaUrl1 = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/utils/check-if-meta-value-exists?meta_key=eth_crypto_wallet_deposit_address&meta_value=${address_to_check_res}`;

        try {
            userMetaUrlResponse1 = await axios.get(userMetaUrl1);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                const updateUserCryptoAddressUrl = `${MODULE1_CRYPTOCURRENCY_BACKEND_BASEURL}/wp-json/nellalink/v2/smart-meta-manager/user/${user_id}`;
                const userAddressMetaRequestBody = {
                    "eth_crypto_wallet_deposit_address": address,
                    "eth_crypto_wallet_deposit_address_checksum": address_checksum
                };
                updateUserCryptoAddressResponse = await axios.put(updateUserCryptoAddressUrl, userAddressMetaRequestBody, {
                    headers: {
                        //'x-api-key': "API KEY HERE"
                    }
                });
                 if (updateUserCryptoAddressResponse.data.status) {
                    response = {
                        status: true,
                        status_code: 200,
                        message: `Address Generated Successfully`,
                        data: {
                            "user_id": user_id,
                            "address": address,
                            "address_checksum": address_checksum,
                            //"privateKeyShow": privateKeyShow

                        }
                    };

                    res.send(response);
                } // Send the data, not the whole Axios response object
                return; // Exit the function after sending the response
            } else {
                throw error; // Throw other errors to be caught by the outer catch block
            }
         }
        

        }
        if(generate_mnemonic==="yes"){
            response = {
                        status: true,
                        status_code: 200,
                        message: `MNEMONIC Generated Successfully`,
                        data: {
                            "generated_mnemonic": generated_mnemonic,
                        }
                    };
        }
        else if (userMetaUrlResponse1.data.data.eth_crypto_wallet_deposit_address.meta_value === address_to_check_res) {
            response = {
                status: true,
                status_code: 200,
                message: `Address Retrieved Successfully`,
                data: {
                    "user_id": user_id,
                    "address": userMetaUrlResponse1.data.data.eth_crypto_wallet_deposit_address.meta_value,
                    "address_checksum": address_checksum_res,
                    //"privateKeyShow": privateKeyShow
                }
            };
        } else {
            response = {
                status: false,
                status_code: 400,
                message: "Unknown Error",
                data: userMetaUrlResponse1.data.data || null
            };
        }

        let status_code = response.status_code;


        res.status(status_code).send(response);

    } catch (error) {
        let error_info;
        if (error.response && error.response.data) {
            error_info = error.response.data;
        } else {
            error_info = error;
        }

        const response = {
            status: false,
            status_code: 400,
            message: error.message || "Internal Error",
            error: error_info
        };

        console.error('Error:', error_info);
        res.status(400).send(response);
    }
});

module.exports = router;

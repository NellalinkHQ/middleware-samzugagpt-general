const axios = require('axios');


// Get Environment Var set from ENV
const MODULE1_BASE_URL = process.env.MODULE1_BASE_URL;
const MODULE1_BASE_API_KEY = process.env.MODULE1_BASE_API_KEY;
const MODULE1_BASE_USER_JWT_SECRET_KEY = process.env.MODULE1_BASE_USER_JWT_SECRET_KEY;


async function fetchReferredUsers(user_id, per_page = 5, page_no = 1, retrieve_paid_users = false) {
    // Parse per_page and page_no to integers
    per_page = parseInt(per_page);
    page_no = parseInt(page_no);

    try {
        const user_meta_url = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/user/${user_id}?meta_key=_username`;
        const user_meta_response = await axios.get(user_meta_url);

        const username = user_meta_response.data.data._username

        //const get_users_api_url = `${MODULE1_BASE_URL}/wp-json/rimplenet/v3/users?page_no=${page_no}&per_page=${per_page}&meta_queries[0][key]=rimplenet_referrer_sponsor&meta_queries[0][value]=${username}&meta_queries[0][compare]=%3D&meta_queries[1][key]=referral_bonus_pattern_1_paid_to&meta_queries[1][value]=${username}&meta_queries[1][compare]=NOT%20EXISTS&meta_queries[2][key]=user_withdrawable_bal_usdt&meta_queries[2][value]=0&meta_queries[2][compare]=%3E&meta_queries_relation=AND&has_published_posts=rimplenettransaction&order_by=ID&order=ASC&metas_to_retrieve=nll_user_email_address_verified,phone_number,rimplenet_referrer_sponsor,referral_bonus_paid_to`;
        const get_users_api_url = `${MODULE1_BASE_URL}/wp-json/rimplenet/v3/users/complex-queries?order_by=ID&order=ASC&page_no=${page_no}&per_page=${per_page}&meta_key=rimplenet_referrer_sponsor&meta_value=${username}&has_published_posts=rimplenettransaction&post_meta[0][0][key]=txn_type&post_meta[0][0][value]=CREDIT&post_meta[0][0][internal_relation]=AND&post_meta[0][0][relation]=AND&post_meta[1][0][key]=currency&post_meta[1][0][value]=bnb&post_meta[1][0][internal_relation]=AND&post_meta[1][0][relation]=OR&post_meta[1][1][key]=currency&post_meta[1][1][value]=usdt&post_meta[1][1][internal_relation]=AND&post_meta[1][1][relation]=OR&post_meta[1][0][relation]=OR&post_meta[1][2][key]=currency&post_meta[1][2][value]=szcb&post_meta[1][2][internal_relation]=AND&post_meta[1][2][relation]=OR&post_meta_relation=AND`; 
        const referred_users = await axios.get(get_users_api_url);

        return {
                status: true,
                status_code: 200,
                message: "User Referred Lists Retrieved Successfully",
                data : {  user_id : user_id,
                          username : username,
                          user_meta_response : user_meta_response.data,
                          referred_users : referred_users.data,
                        }
            };
        
    } catch (error) {
        console.error('Error fetchReferredUsers:', error);
        throw error;
    }
}

async function payReferralBonustoReferrerSponsor(user_id_referrer_sponsor, $referral_bonus_pattern, $metas ) {
    // Parse user_id_referrer_sponsor to integers
    user_id_referrer_sponsor = parseInt(user_id_referrer_sponsor);
    

    try {


        const fetch_referred_users_response = await fetchReferredUsers(user_id_referrer_sponsor, 5, 1);
        const referred_users_data = fetch_referred_users_response.data.referred_users.data;
        
        let response;
        if (referred_users_data && referred_users_data.length > 0) {

            for (const referred_user of referred_users_data) {
                
                const referred_user_id = referred_user.user_id;
                
                //Get transactions of user
                let transactions_by_referred_user;
                try {
                    const transaction_url = `${MODULE1_BASE_URL}/wp-json/rimplenet/v3/transactions?user_id=${referred_user_id}&order=ASC&per_page=1&page_no=1&order_by=ID&transaction_type=CREDIT&meta_queries[0][key]=currency&meta_queries[0][value]=bnb&meta_queries[0][compare]=%3D&meta_queries[1][key]=currency&meta_queries[1][value]=usdt&&meta_queries[1][compare]=%3D&meta_queries[2][key]=currency&meta_queries[2][value]=szcb&meta_queries[2][compare]=%3D&meta_queries_relation=OR`; 
                    const transactions_by_referred_user_response = await axios.get(transaction_url, {
                        headers: {
                            'x-api-key': MODULE1_BASE_API_KEY
                        }
                    });

                    transactions_by_referred_user = transactions_by_referred_user_response.data.data;
                } catch (error) {
                    transactions_by_referred_user = false;
                    console.log("Error payReferralBonustoReferrerSponsor fetch referred user txn :", error);
                }
                referred_user.transactions_by_referred_user = transactions_by_referred_user


                const credit_url = `${MODULE1_BASE_URL}/wp-json/rimplenet/v1/credits`;

                let app_credit_response_data, app_credit_response_data_transaction_id;
                if (!referred_user.referral_bonus_paid_to && transactions_by_referred_user && referred_user.user_id) {
                    
                    const referral_bonus_setting_metas = $metas

                    try {
                        // Send credit request to the backend
                        const referred_user_id = referred_user.user_id;

                        const amount = parseFloat(transactions_by_referred_user[0].amount);
                        const wallet_id_of_transaction = transactions_by_referred_user[0].wallet_id
                        const percentage = parseFloat(referral_bonus_setting_metas.usdt.percentage_for_referrer_sponsor_on_deposit_1);
                        const percentage_value = percentage / 100;

                        // Calculate Percentage amount
                        const percentage_amount = amount * percentage_value;

                        const credit_response = await axios.post(credit_url, {
                            request_id: `referral_bonus_from_user_${referred_user_id}`,
                            user_id: user_id_referrer_sponsor,
                            wallet_id: `${wallet_id_of_transaction}_referral_bonus`,
                            amount: percentage_amount,
                            note: `Referral Bonus from User - #${referred_user_id}`,
                            meta_data: {
                                "referral_bonus_user_id_from": referred_user_id,
                                "referral_bonus_transaction_id_from": transactions_by_referred_user[0].transaction_id,
                                "referral_bonus_percentage_paid_for_this_transaction": percentage,

                                "transaction_action_type": "referral_bonus_pattern_1",
                                "transaction_type_category": "referral_bonus",
                                "transaction_processor": "middleware"
                            }
                        }, {
                            headers: {
                                'x-api-key': MODULE1_BASE_API_KEY
                            }
                        });

                        app_credit_response_data = credit_response.data;
                        app_credit_response_data_transaction_id = app_credit_response_data.data.transaction_id;
                    } catch (error) {
                        if (error.response && error.response.status === 409) {
                            app_credit_response_data = error.response.data;
                            app_credit_response_data_transaction_id = app_credit_response_data.error.txn_id;

                        } else {
                            throw error; // Throw other errors to be caught by the outer catch block
                        }
                    }

                    referred_user.user_sponsor_referral_bonus_credit_response_data = app_credit_response_data; // Append credit response data
                } // if ends

                let update_user_request_response;
                if(app_credit_response_data_transaction_id){

                    try {
                        const update_user_url = `${MODULE1_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/user/${referred_user_id}`;
                        const update_user_request_body = {
                            referral_bonus_pattern_1_paid_to: user_id_referrer_sponsor
                        };

                        const update_user_request = await axios.put(update_user_url, update_user_request_body, {
                            headers: {
                                'x-api-key': MODULE1_BASE_API_KEY,
                             // 'Authorization': `Bearer ${userBearerJWToken}`
                            }
                        });

                        update_user_request_response = update_user_request.data;

                    }
                    catch (error) {
                        update_user_request_response = error;
                    }
                }
                referred_user.update_user_referral_bonus_pattern_1_paid_to = update_user_request_response; 

            }//loops end


            response = {
                status: true,
                status_code: 200,
                message: "Referrer Sponsor Bonus Payment Status Retrieved",
                data : {  user_id_referrer_sponsor : user_id_referrer_sponsor,
                          referred_users : referred_users_data,
                        }
            };
        }
        else{
            response = {
                status: true,
                status_code: 200,
                message: "No Referrer Sponsor Bonus Payment to Process",
                data : {  user_id_referrer_sponsor : user_id_referrer_sponsor,
                          referred_users : referred_users_data,
                        }
            };
        }
        
        return response;
        
    } catch (error) {
        console.error('Error payReferralBonustoReferrerSponsor:', error);
        throw error;
    }
}

// Export the router and the function
module.exports = {
    fetchReferredUsers: fetchReferredUsers,
    payReferralBonustoReferrerSponsor: payReferralBonustoReferrerSponsor
};
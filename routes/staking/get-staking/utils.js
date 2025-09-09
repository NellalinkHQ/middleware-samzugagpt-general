/**
 * Get Staking Plan Data Utility Functions
 * Provides plan-specific configuration and details
 */

const axios = require('axios');

// Default values - these will be overridden by getter function
const DEFAULT_SUPPORTED_STAKING_WALLETS = 'szcb,szcbii,hhc';
const DEFAULT_EXCHANGE_RATE_TO_USDT_STAKING_INTEREST = '0.1';
const DEFAULT_MINIMUM_STAKING_AMOUNT = '5';
const DEFAULT_MAXIMUM_STAKING_AMOUNT = '100';
const DEFAULT_MINIMUM_ROI_WITHDRAWAL_AMOUNT = '1';
const DEFAULT_MAXIMUM_ROI_WITHDRAWAL_AMOUNT = '50';
const DEFAULT_ROI_WITHDRAWAL_FEE_INTERNAL = '0';
const DEFAULT_ROI_WITHDRAWAL_FEE_EXTERNAL = '1';
const DEFAULT_ROI_WITHDRAWAL_FEE_WALLET = 'szcb2';
const DEFAULT_CAPITAL_WITHDRAWAL_FEE_INTERNAL = '0';
const DEFAULT_CAPITAL_WITHDRAWAL_FEE_EXTERNAL = '1';
const DEFAULT_CAPITAL_WITHDRAWAL_FEE_WALLET = 'szcb2';

// API Configuration
const MODULE1_STAKING_BASE_URL = process.env.MODULE1_STAKING_BASE_URL;
const MODULE1_STAKING_API_KEY = process.env.MODULE1_STAKING_API_KEY;

// Cache configuration
const stakingPlanCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

/**
 * Get list of supported staking plan IDs
 * @returns {Array} Array of supported plan IDs
 */
function getSupportedPlanIds() {
    return ['plan_1', 'plan_2', 'plan_3', 'plan_4', 'plan_5'];
}

/**
 * Validate if a staking plan ID is supported
 * @param {string} staking_plan_id - The plan ID to validate
 * @returns {Object} Validation result
 */
function validateStakingPlanId(staking_plan_id) {
    const supportedPlans = getSupportedPlanIds();
    
    if (!staking_plan_id) {
        return {
            isValid: false,
            error: {
                status: false,
                status_code: 400,
                message: 'staking_plan_id is required',
                error: {
                    provided_plan_id: staking_plan_id,
                    supported_plans: supportedPlans,
                    recommendation: 'Provide a valid staking plan ID'
                }
            }
        };
    }

    if (!supportedPlans.includes(staking_plan_id)) {
        return {
            isValid: false,
            error: {
                status: false,
                status_code: 400,
                message: `Unsupported staking plan ID: ${staking_plan_id}`,
                error: {
                    provided_plan_id: staking_plan_id,
                    supported_plans: supportedPlans,
                    recommendation: 'Use one of the supported plan IDs'
                }
            }
        };
    }

    return { isValid: true };
}

// ============================================================================
// MAIN IMPLEMENTATION FUNCTIONS (SETTER & GETTER)
// ============================================================================

/**
 * Set staking plan data via API
 * @param {string} staking_plan_id - The staking plan ID (e.g., 'plan_1', 'plan_4')
 * @param {Object} planData - The plan data to set
 * @returns {Promise<Object>} API response
 */
async function setStakingPlanData(staking_plan_id, planData) {
    try {
        if (!MODULE1_STAKING_BASE_URL || !MODULE1_STAKING_API_KEY) {
            throw new Error('MODULE1_STAKING_BASE_URL and MODULE1_STAKING_API_KEY are required');
        }

        // Validate staking plan ID
        const validation = validateStakingPlanId(staking_plan_id);
        if (!validation.isValid) {
            return validation.error;
        }

        if (!planData || typeof planData !== 'object') {
            throw new Error('planData must be a valid object');
        }

        // Get supported staking wallets
        const supportedWallets = DEFAULT_SUPPORTED_STAKING_WALLETS.split(',');
        
        // Normalize user data keys (remove staking_ prefix if present)
        const normalizedPlanData = {};
        Object.keys(planData).forEach(key => {
            if (key.startsWith('staking_')) {
                const normalizedKey = key.replace('staking_', '');
                normalizedPlanData[normalizedKey] = planData[key];
            } else {
                normalizedPlanData[key] = planData[key];
            }
        });

        // Add wallet-specific ROI withdrawal amount defaults
        const walletSpecificDefaults = {};
        supportedWallets.forEach(wallet => {
            walletSpecificDefaults[`minimum_roi_withdrawal_amount_${wallet}`] = DEFAULT_MINIMUM_ROI_WITHDRAWAL_AMOUNT;
            walletSpecificDefaults[`maximum_roi_withdrawal_amount_${wallet}`] = DEFAULT_MAXIMUM_ROI_WITHDRAWAL_AMOUNT;
        });

        // Merge user data with default withdrawal fees and supported wallets
        const defaultFees = {
            supported_staking_wallet: supportedWallets.join(','),
            ...walletSpecificDefaults,
            roi_withdrawal_fee_internal: DEFAULT_ROI_WITHDRAWAL_FEE_INTERNAL,
            roi_withdrawal_fee_external: DEFAULT_ROI_WITHDRAWAL_FEE_EXTERNAL,
            roi_withdrawal_fee_wallet: DEFAULT_ROI_WITHDRAWAL_FEE_WALLET,
            capital_withdrawal_fee_internal: DEFAULT_CAPITAL_WITHDRAWAL_FEE_INTERNAL,
            capital_withdrawal_fee_external: DEFAULT_CAPITAL_WITHDRAWAL_FEE_EXTERNAL,
            capital_withdrawal_fee_wallet: DEFAULT_CAPITAL_WITHDRAWAL_FEE_WALLET
        };

        // Merge user data with defaults (user data takes precedence)
        const mergedData = { ...defaultFees, ...normalizedPlanData };

        // Prepare data with plan_id prefix
        const prefixedData = {};
        Object.keys(mergedData).forEach(key => {
            prefixedData[`${staking_plan_id}_${key}`] = mergedData[key];
        });

        const config = {
            method: 'put',
            maxBodyLength: Infinity,
            url: `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/site-wide`,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': MODULE1_STAKING_API_KEY
            },
            data: JSON.stringify(prefixedData)
        };

        const response = await axios.request(config);
        
        // Invalidate cache for this plan
        invalidateStakingPlanCache(staking_plan_id);
        
        return {
            status: true,
            status_code: 200,
            message: `Staking plan data set successfully for ${staking_plan_id}`,
            data: response.data,
            meta: {
            }
        };

    } catch (error) {
        return {
            status: false,
            status_code: error.response?.status || 400,
            message: 'Failed to set staking plan data',
            error: {
                message: error.message,
                staking_plan_id: staking_plan_id,
                details: error.response?.data || null
            }
        };
    }
}

/**
 * Get staking plan data from API with caching
 * @param {string} staking_plan_id - The staking plan ID (e.g., 'plan_1', 'plan_4')
 * @returns {Promise<Object>} Plan configuration data
 */
async function getStakingPlanDataFromAPI(staking_plan_id) {
    try {
        // Validate staking plan ID
        const validation = validateStakingPlanId(staking_plan_id);
        if (!validation.isValid) {
            return validation.error;
        }

        // Check cache first
        const cached = stakingPlanCache.get(staking_plan_id);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            return cached.data;
        }

        if (!MODULE1_STAKING_BASE_URL || !MODULE1_STAKING_API_KEY) {
            throw new Error('MODULE1_STAKING_BASE_URL and MODULE1_STAKING_API_KEY are required');
        }

        // First, get the supported_staking_wallet to determine which wallets to request
        const supportedWalletKey = `${staking_plan_id}_supported_staking_wallet`;
        const supportedWalletUrl = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/site-wide?meta_key=${supportedWalletKey}`;
        
        const supportedWalletResponse = await axios.get(supportedWalletUrl, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY
            }
        });

        const supportedWalletData = supportedWalletResponse.data.data || {};
        const apiSupportedWallets = supportedWalletData[supportedWalletKey];
        const supportedWallets = apiSupportedWallets ? 
            apiSupportedWallets.split(',').map(w => w.trim()) : 
            DEFAULT_SUPPORTED_STAKING_WALLETS.split(',');

        // Now build meta keys based on the actual supported wallets
        const metaKeys = [];
        
        // Add exchange rate keys for each supported wallet (without staking_ prefix)
        supportedWallets.forEach(wallet => {
            metaKeys.push(`${staking_plan_id}_exchange_rate_${wallet}_to_usdt_staking_interest`);
        });

        // Add minimum and maximum amount keys for each supported wallet (without staking_ prefix)
        supportedWallets.forEach(wallet => {
            metaKeys.push(`${staking_plan_id}_minimum_staking_amount_${wallet}`);
            metaKeys.push(`${staking_plan_id}_maximum_staking_amount_${wallet}`);
        });

        // Add minimum and maximum ROI withdrawal amount keys for each supported wallet
        supportedWallets.forEach(wallet => {
            metaKeys.push(`${staking_plan_id}_minimum_roi_withdrawal_amount_${wallet}`);
            metaKeys.push(`${staking_plan_id}_maximum_roi_withdrawal_amount_${wallet}`);
        });

        // Add other plan-specific keys (not wallet-specific)
        metaKeys.push(
            `${staking_plan_id}_supported_staking_wallet`,
            `${staking_plan_id}_roi_withdrawal_fee_internal`,
            `${staking_plan_id}_roi_withdrawal_fee_external`,
            `${staking_plan_id}_roi_withdrawal_fee_wallet`,
            `${staking_plan_id}_capital_withdrawal_fee_internal`,
            `${staking_plan_id}_capital_withdrawal_fee_external`,
            `${staking_plan_id}_capital_withdrawal_fee_wallet`
        );

        const metaKeyString = metaKeys.join(',');
        const url = `${MODULE1_STAKING_BASE_URL}/wp-json/nellalink/v2/smart-meta-manager/site-wide?meta_key=${metaKeyString}`;

        const response = await axios.get(url, {
            headers: {
                'x-api-key': MODULE1_STAKING_API_KEY
            }
        });

        const apiData = response.data.data || {};
        
        // Process the data to remove plan_id prefix
        const processedData = {
            staking_plan: staking_plan_id
        };

        Object.keys(apiData).forEach(key => {
            if (key.startsWith(`${staking_plan_id}_`)) {
                const cleanKey = key.replace(`${staking_plan_id}_`, '');
                const value = apiData[key];
                // Only use API value if it's not false, null, undefined, or empty string
                if (value !== false && value !== null && value !== undefined && value !== '') {
                    // Handle both prefixed and non-prefixed keys
                    if (cleanKey.startsWith('staking_')) {
                        // Remove staking_ prefix for consistency
                        const finalKey = cleanKey.replace('staking_', '');
                        processedData[finalKey] = value;
                    } else {
                        processedData[cleanKey] = value;
                    }
                }
            }
        });

        // Get default plan data
        const defaultPlanData = getStakingPlanData(staking_plan_id);
        
        // Create a filtered default data object with only the supported wallets
        const filteredDefaultData = {
            staking_plan: staking_plan_id,
            supported_staking_wallet: supportedWallets.join(',')
        };

        // Add wallet-specific data only for supported wallets
        supportedWallets.forEach(walletTicker => {
            if (walletTicker) {
                // Exchange rate for each wallet to USDT staking interest
                filteredDefaultData[`exchange_rate_${walletTicker}_to_usdt_staking_interest`] = DEFAULT_EXCHANGE_RATE_TO_USDT_STAKING_INTEREST;
                
                // Minimum staking amount for each wallet
                filteredDefaultData[`minimum_staking_amount_${walletTicker}`] = DEFAULT_MINIMUM_STAKING_AMOUNT;
                
                // Maximum staking amount for each wallet
                filteredDefaultData[`maximum_staking_amount_${walletTicker}`] = DEFAULT_MAXIMUM_STAKING_AMOUNT;
                
                // Minimum ROI withdrawal amount for each wallet
                filteredDefaultData[`minimum_roi_withdrawal_amount_${walletTicker}`] = DEFAULT_MINIMUM_ROI_WITHDRAWAL_AMOUNT;
                
                // Maximum ROI withdrawal amount for each wallet
                filteredDefaultData[`maximum_roi_withdrawal_amount_${walletTicker}`] = DEFAULT_MAXIMUM_ROI_WITHDRAWAL_AMOUNT;
            }
        });

        // Add withdrawal fees at the end
        filteredDefaultData.roi_withdrawal_fee_internal = DEFAULT_ROI_WITHDRAWAL_FEE_INTERNAL;
        filteredDefaultData.roi_withdrawal_fee_external = DEFAULT_ROI_WITHDRAWAL_FEE_EXTERNAL;
        filteredDefaultData.roi_withdrawal_fee_wallet = DEFAULT_ROI_WITHDRAWAL_FEE_WALLET;
        filteredDefaultData.capital_withdrawal_fee_internal = DEFAULT_CAPITAL_WITHDRAWAL_FEE_INTERNAL;
        filteredDefaultData.capital_withdrawal_fee_external = DEFAULT_CAPITAL_WITHDRAWAL_FEE_EXTERNAL;
        filteredDefaultData.capital_withdrawal_fee_wallet = DEFAULT_CAPITAL_WITHDRAWAL_FEE_WALLET;

        // Merge with default values for missing keys
        const mergedData = {
            ...filteredDefaultData,
            ...processedData
        };

        const result = {
            status: true,
            status_code: 200,
            message: `Staking plan data retrieved successfully for ${staking_plan_id}`,
            data: mergedData
        };

        // Cache the result
        stakingPlanCache.set(staking_plan_id, {
            data: result,
            timestamp: Date.now()
        });

        return result;

    } catch (error) {
        return {
            status: false,
            status_code: error.response?.status || 500,
            message: 'Failed to retrieve staking plan data from API',
            error: {
                message: error.message,
                staking_plan_id: staking_plan_id,
                details: error.response?.data || null
            }
        };
    }
}

// ============================================================================
// SUPPORTING FUNCTIONS
// ============================================================================

/**
 * Get staking plan data based on plan ID
 * @param {string} staking_plan_id - The staking plan ID (e.g., 'plan_4', 'plan_5')
 * @returns {Object} Plan configuration data
 */
function getStakingPlanData(staking_plan_id) {
    try {
        // Validate staking plan ID
        const validation = validateStakingPlanId(staking_plan_id);
        if (!validation.isValid) {
            return validation.error;
        }

        // Get supported staking wallets using default constant
        const supportedWallets = DEFAULT_SUPPORTED_STAKING_WALLETS.split(',');
        
        // Initialize result object with default values
        const planData = {
            staking_plan: staking_plan_id,
            supported_staking_wallet: supportedWallets.join(',')
        };

        // Add wallet-specific data for each supported wallet
        supportedWallets.forEach(walletTicker => {
            if (walletTicker) {
                // Exchange rate for each wallet to USDT staking interest
                planData[`exchange_rate_${walletTicker}_to_usdt_staking_interest`] = DEFAULT_EXCHANGE_RATE_TO_USDT_STAKING_INTEREST;
                
                // Minimum staking amount for each wallet
                planData[`minimum_staking_amount_${walletTicker}`] = DEFAULT_MINIMUM_STAKING_AMOUNT;
                
                // Maximum staking amount for each wallet
                planData[`maximum_staking_amount_${walletTicker}`] = DEFAULT_MAXIMUM_STAKING_AMOUNT;
                
                // Minimum ROI withdrawal amount for each wallet
                planData[`minimum_roi_withdrawal_amount_${walletTicker}`] = DEFAULT_MINIMUM_ROI_WITHDRAWAL_AMOUNT;
                
                // Maximum ROI withdrawal amount for each wallet
                planData[`maximum_roi_withdrawal_amount_${walletTicker}`] = DEFAULT_MAXIMUM_ROI_WITHDRAWAL_AMOUNT;
            }
        });

        // Add withdrawal fees at the end
        planData.roi_withdrawal_fee_internal = DEFAULT_ROI_WITHDRAWAL_FEE_INTERNAL;
        planData.roi_withdrawal_fee_external = DEFAULT_ROI_WITHDRAWAL_FEE_EXTERNAL;
        planData.roi_withdrawal_fee_wallet = DEFAULT_ROI_WITHDRAWAL_FEE_WALLET;
        planData.capital_withdrawal_fee_internal = DEFAULT_CAPITAL_WITHDRAWAL_FEE_INTERNAL;
        planData.capital_withdrawal_fee_external = DEFAULT_CAPITAL_WITHDRAWAL_FEE_EXTERNAL;
        planData.capital_withdrawal_fee_wallet = DEFAULT_CAPITAL_WITHDRAWAL_FEE_WALLET;

        return {
            status: true,
            status_code: 200,
            message: `Staking plan data retrieved successfully for ${staking_plan_id}`,
            data: planData
        };

    } catch (error) {
        return {
            status: false,
            status_code: 400,
            message: 'Failed to retrieve staking plan data',
            error: {
                message: error.message,
                staking_plan_id: staking_plan_id
            }
        };
    }
}


/**
 * Validate if a wallet is supported for staking
 * @param {string} walletTicker - The wallet ticker to validate
 * @returns {boolean} True if wallet is supported
 */
function isWalletSupported(walletTicker) {
    const supportedWallets = DEFAULT_SUPPORTED_STAKING_WALLETS.split(',');
    return supportedWallets.includes(walletTicker);
}

/**
 * Get wallet-specific staking limits
 * @param {string} walletTicker - The wallet ticker
 * @returns {Object} Minimum and maximum staking amounts for the wallet
 */
function getWalletStakingLimits(walletTicker) {
    if (!isWalletSupported(walletTicker)) {
        return {
            status: false,
            status_code: 400,
            message: `Wallet ${walletTicker} is not supported for staking`,
            error: {
                wallet_ticker: walletTicker,
                supported_wallets: DEFAULT_SUPPORTED_STAKING_WALLETS.split(',')
            }
        };
    }

    return {
        status: true,
        status_code: 200,
        message: `Staking limits retrieved for ${walletTicker}`,
        data: {
            wallet_ticker: walletTicker,
            minimum_staking_amount: DEFAULT_MINIMUM_STAKING_AMOUNT,
            maximum_staking_amount: DEFAULT_MAXIMUM_STAKING_AMOUNT,
            exchange_rate_to_usdt_staking_interest: DEFAULT_EXCHANGE_RATE_TO_USDT_STAKING_INTEREST
        }
    };
}

/**
 * Get supported staking plans
 * @returns {Object} List of supported staking plans
 */
function getSupportedStakingPlan() {
    const supportedPlans = getSupportedPlanIds();
    
    // Get plan names from environment variables
    const plan1Name = process.env.MODULE1_STAKING_PLAN_1_NAME || 'Plan 1';
    const plan2Name = process.env.MODULE1_STAKING_PLAN_2_NAME || 'Plan 2';
    const plan3Name = process.env.MODULE1_STAKING_PLAN_3_NAME || 'Plan 3';
    const plan4Name = process.env.MODULE1_STAKING_PLAN_4_NAME || 'Plan 4';
    const plan5Name = process.env.MODULE1_STAKING_PLAN_5_NAME || 'Plan 5';
    
    return {
        status: true,
        status_code: 200,
        message: 'Supported staking plans retrieved successfully',
        data: {
            supported_plans: supportedPlans,
            plan_details: {
                plan_1: plan1Name,
                plan_2: plan2Name,
                plan_3: plan3Name,
                plan_4: plan4Name,
                plan_5: plan5Name
            }
        },
        meta : {
            total_plans: supportedPlans.length,
        }
    };
}

// ============================================================================
// ENDPOINT HANDLER FUNCTIONS
// ============================================================================

/**
 * Handle GET /data/supported-plans endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function handleGetSupportedPlans(req, res, next) {
    try {
        const result = getSupportedStakingPlan();
        res.status(result.status_code).json(result);
    } catch (error) {
        res.status(500).json({
            status: false,
            status_code: 500,
            message: 'Internal server error while retrieving supported staking plans',
            error: {
                message: error.message
            }
        });
    }
}

/**
 * Handle PUT /data/plan/:staking_plan_id/set endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function handleSetStakingPlanData(req, res, next) {
    try {
        const { staking_plan_id } = req.params;
        const planData = req.body;
        
        const result = await setStakingPlanData(staking_plan_id, planData);
        res.status(result.status_code).json(result);
    } catch (error) {
        res.status(500).json({
            status: false,
            status_code: 500,
            message: 'Internal server error while setting staking plan data',
            error: {
                message: error.message
            }
        });
    }
}

/**
 * Handle GET /data/plan/:staking_plan_id endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function handleGetStakingPlanData(req, res, next) {
    try {
        const { staking_plan_id } = req.params;
        
        const result = await getStakingPlanDataFromAPI(staking_plan_id);
        res.status(result.status_code).json(result);
    } catch (error) {
        res.status(500).json({
            status: false,
            status_code: 500,
            message: 'Internal server error while retrieving staking plan data',
            error: {
                message: error.message
            }
        });
    }
}

// ============================================================================
// CACHE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Invalidate cache for a specific staking plan
 * @param {string} staking_plan_id - The staking plan ID to invalidate
 */
function invalidateStakingPlanCache(staking_plan_id) {
    stakingPlanCache.delete(staking_plan_id);
}

/**
 * Clear all staking plan cache
 */
function clearStakingPlanCache() {
    stakingPlanCache.clear();
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
    getStakingPlanData,
    isWalletSupported,
    getWalletStakingLimits,
    getSupportedStakingPlan,
    setStakingPlanData,
    getStakingPlanDataFromAPI,
    invalidateStakingPlanCache,
    clearStakingPlanCache,
    handleGetSupportedPlans,
    handleSetStakingPlanData,
    handleGetStakingPlanData,
    getSupportedPlanIds,
    validateStakingPlanId
};
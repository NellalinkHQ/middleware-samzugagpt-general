/**
 * Staking Utilities
 * Utility functions for calculating staking-related metrics and values
 */

// Timestamp interval values for different payment intervals
const TIMESTAMP_INTERVAL_VALUES = {
    every_second: { ts: 1, name: "Second", name_plural: "Seconds", name_repetition: "Every Second" },
    every_minute: { ts: 60, name: "Minute", name_plural: "Minutes", name_repetition: "Every Minute" },
    every_hour: { ts: 3600, name: "Hour", name_plural: "Hours", name_repetition: "Every Hour" },
    every_day: { ts: 86400, name: "Day", name_plural: "Days", name_repetition: "Daily" },
    every_week: { ts: 604800, name: "Week", name_plural: "Weeks", name_repetition: "Weekly" },
    every_month: { ts: 2592000, name: "Month", name_plural: "Months", name_repetition: "Monthly" },
    every_year: { ts: 31536000, name: "Year", name_plural: "Years", name_repetition: "Yearly" }
};

/**
 * Calculate staking metrics and accumulated values
 * @param {Object} stakingData - Staking data object
 * @param {number} stakingData.staking_amount - Original staking amount
 * @param {number} stakingData.staking_roi_interval_payment_amount - ROI payment amount per interval
 * @param {string} stakingData.staking_roi_payment_interval - Payment interval (e.g., 'every_second')
 * @param {number} stakingData.staking_roi_payment_startime_ts - Start time timestamp
 * @param {number} stakingData.staking_roi_payment_endtime_ts - End time timestamp
 * @param {number} stakingData.staking_last_withdrawal_ts - Last withdrawal timestamp (0 if no withdrawal)
 * @param {number} stakingData.staking_roi_full_payment_amount_at_end_of_contract - Total ROI at end of contract
 * @param {number} [stakingData.staking_roi_amount_withdrawn_so_far] - Total ROI already withdrawn (optional)
 * @param {number} [providedDatetime] - Optional specific datetime to calculate for (timestamp in seconds)
 * @returns {Object} Calculated staking metrics
 */
function calculateStakingMetrics(stakingData, providedDatetime = null) {
    const {
        staking_amount,
        staking_roi_interval_payment_amount,
        staking_roi_payment_interval,
        staking_roi_payment_startime_ts,
        staking_roi_payment_endtime_ts,
        staking_last_withdrawal_ts,
        staking_roi_full_payment_amount_at_end_of_contract,
        staking_roi_amount_withdrawn_so_far = 0
    } = stakingData;

    // Current timestamp
    const currentTimestamp = Math.floor(Date.now() / 1000);
    // Use provided datetime if available, otherwise use current time
    const calculationTimestamp = providedDatetime || currentTimestamp;
    // Get interval timestamp value
    const intervalTs = TIMESTAMP_INTERVAL_VALUES[staking_roi_payment_interval].ts;
    
    // For ROI calculation, use the minimum of current time and contract end time
    // This ensures ROI stops accumulating when contract ends (e.g., capital withdrawal in Plan 3)
    const effectiveNow = Math.min(currentTimestamp, staking_roi_payment_endtime_ts);
    
    // Calculate payment intervals - use effective time for "till now"
    const count_number_of_staking_payment_interval_from_startime_till_now = 
        Math.floor((effectiveNow - staking_roi_payment_startime_ts) / intervalTs);
    
    // For withdrawal logic, be more restrictive - only allow withdrawal of ROI earned before contract end
    const withdrawalEffectiveNow = Math.min(currentTimestamp, staking_roi_payment_endtime_ts);
    const count_number_of_staking_payment_interval_from_startime_till_now_for_withdrawal = 
        Math.floor((withdrawalEffectiveNow - staking_roi_payment_startime_ts) / intervalTs);
    const count_number_of_staking_payment_interval_from_startime_till_provided_datetime = 
        Math.floor((calculationTimestamp - staking_roi_payment_startime_ts) / intervalTs);
    const count_number_of_staking_payment_interval_from_startime_till_endtime = 
        Math.floor((staking_roi_payment_endtime_ts - staking_roi_payment_startime_ts) / intervalTs);
    // Calculate accumulated ROI for display purposes
    let accumulated_roi_now = count_number_of_staking_payment_interval_from_startime_till_now * staking_roi_interval_payment_amount;
    const accumulated_roi_at_provided_datetime = count_number_of_staking_payment_interval_from_startime_till_provided_datetime * staking_roi_interval_payment_amount;
    
    // Cap accumulated ROI to never exceed the total ROI at end of contract
    if (accumulated_roi_now > staking_roi_full_payment_amount_at_end_of_contract) {
        accumulated_roi_now = staking_roi_full_payment_amount_at_end_of_contract;
    }
    
    // Calculate accumulated total amounts
    const accumulated_total_amount_now = staking_amount + accumulated_roi_now;
    const accumulated_total_amount_at_end_of_staking_contract = staking_amount + staking_roi_full_payment_amount_at_end_of_contract;

    // Calculate withdrawal-related values using withdrawal-specific count
    const accumulated_roi_for_withdrawal = count_number_of_staking_payment_interval_from_startime_till_now_for_withdrawal * staking_roi_interval_payment_amount;
    let accumulated_roi_user_can_withdraw_now = accumulated_roi_for_withdrawal - parseFloat(staking_roi_amount_withdrawn_so_far || 0);
    if (accumulated_roi_user_can_withdraw_now < 0) accumulated_roi_user_can_withdraw_now = 0;
    
    // Cap the withdrawable amount to never exceed the total ROI at end of contract
    const max_withdrawable = staking_roi_full_payment_amount_at_end_of_contract - parseFloat(staking_roi_amount_withdrawn_so_far || 0);
    if (accumulated_roi_user_can_withdraw_now > max_withdrawable) {
        accumulated_roi_user_can_withdraw_now = max_withdrawable;
    }
    
    let accumulated_roi_user_have_already_withdraw = parseFloat(staking_roi_amount_withdrawn_so_far || 0);

    // Format current datetime
    const datetime = new Date(currentTimestamp * 1000);
    const accumulated_datetime_retrieved_at = datetime.toLocaleString();

    return {
        count_number_of_staking_payment_interval_from_startime_till_now,
        count_number_of_staking_payment_interval_from_startime_till_provided_datetime,
        count_number_of_staking_payment_interval_from_startime_till_endtime,
        accumulated_roi_user_can_withdraw_now: accumulated_roi_user_can_withdraw_now,
        accumulated_roi_user_have_already_withdraw: accumulated_roi_user_have_already_withdraw,
        accumulated_roi_now: accumulated_roi_now,
        accumulated_total_amount_now: accumulated_total_amount_now,
        accumulated_total_roi_at_end_of_staking_contract: staking_roi_full_payment_amount_at_end_of_contract,
        accumulated_total_amount_at_end_of_staking_contract: accumulated_total_amount_at_end_of_staking_contract,
        accumulated_timestamp_retrieved_at: currentTimestamp,
        accumulated_datetime_retrieved_at
    };
}

/**
 * Calculate staking metrics from staking meta data
 * @param {Object} stakingMetaData - Staking meta data from API
 * @param {number} [providedDatetime] - Optional specific datetime to calculate for
 * @returns {Object} Calculated staking metrics
 */
function calculateStakingMetricsFromMetaData(stakingMetaData, providedDatetime = null) {
    const stakingData = {
        staking_amount: parseFloat(stakingMetaData.staking_amount),
        staking_roi_interval_payment_amount: parseFloat(stakingMetaData.staking_roi_interval_payment_amount),
        staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
        staking_roi_payment_startime_ts: parseInt(stakingMetaData.staking_roi_payment_startime_ts),
        staking_roi_payment_endtime_ts: parseInt(stakingMetaData.staking_roi_payment_endtime_ts),
        staking_last_withdrawal_ts: parseInt(stakingMetaData.staking_roi_last_withdrawal_ts) || 0,
        staking_roi_full_payment_amount_at_end_of_contract: parseFloat(stakingMetaData.staking_roi_full_payment_amount_at_end_of_contract),
        staking_roi_amount_withdrawn_so_far: parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far || 0)
    };
    return calculateStakingMetrics(stakingData, providedDatetime);
}

/**
 * Calculate both normal and pattern_2 staking summaries from meta data
 * @param {Object} stakingMetaData - Staking meta data from API
 * @param {number} [providedDatetime] - Optional specific datetime to calculate for
 * @returns {Object} { normal: {...}, pattern_2: {...} }
 */
function calculateAllStakingSummariesFromMetaData(stakingMetaData, providedDatetime = null) {
    // Always calculate normal
    const normal = calculateStakingMetrics({
        staking_amount: parseFloat(stakingMetaData.staking_amount),
        staking_roi_interval_payment_amount: parseFloat(stakingMetaData.staking_roi_interval_payment_amount),
        staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
        staking_roi_payment_startime_ts: parseInt(stakingMetaData.staking_roi_payment_startime_ts),
        staking_roi_payment_endtime_ts: parseInt(stakingMetaData.staking_roi_payment_endtime_ts),
        staking_last_withdrawal_ts: parseInt(stakingMetaData.staking_roi_last_withdrawal_ts) || 0,
        staking_roi_full_payment_amount_at_end_of_contract: parseFloat(stakingMetaData.staking_roi_full_payment_amount_at_end_of_contract),
        staking_roi_amount_withdrawn_so_far: parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far || 0)
    }, providedDatetime);

    // Only calculate pattern_2 if those fields exist
    let pattern_2 = undefined;
    if (
        stakingMetaData.staking_amount_internal_pattern_2 !== undefined &&
        stakingMetaData.staking_roi_interval_payment_amount_internal_pattern_2 !== undefined
    ) {
        pattern_2 = calculateStakingMetrics({
            staking_amount: parseFloat(stakingMetaData.staking_amount_internal_pattern_2),
            staking_roi_interval_payment_amount: parseFloat(stakingMetaData.staking_roi_interval_payment_amount_internal_pattern_2),
            staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
            staking_roi_payment_startime_ts: parseInt(stakingMetaData.staking_roi_payment_startime_ts_internal_pattern_2),
            staking_roi_payment_endtime_ts: parseInt(stakingMetaData.staking_roi_payment_endtime_ts_internal_pattern_2),
            staking_last_withdrawal_ts: parseInt(stakingMetaData.staking_roi_last_withdrawal_ts_internal_pattern_2) || 0,
            staking_roi_full_payment_amount_at_end_of_contract: parseFloat(stakingMetaData.staking_roi_full_payment_amount_at_end_of_contract_internal_pattern_2),
            staking_roi_amount_withdrawn_so_far: parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0)
        }, providedDatetime);
    }

    // Map to clear field names for summary
    function mapSummaryFields(metrics) {
        return {
            accumulated_roi_now: metrics.accumulated_roi_now,
            accumulated_total_amount_now: metrics.accumulated_total_amount_now,
            accumulated_roi_at_end_of_contract: metrics.accumulated_total_roi_at_end_of_staking_contract,
            accumulated_total_amount_at_end_of_contract: metrics.accumulated_total_amount_at_end_of_staking_contract,
            accumulated_roi_user_can_withdraw_now: metrics.accumulated_roi_user_can_withdraw_now_initial,
            accumulated_roi_user_have_already_withdraw: metrics.accumulated_roi_user_have_already_withdraw_initial,
            count_number_of_staking_payment_interval_from_startime_till_now: metrics.count_number_of_staking_payment_interval_from_startime_till_now,
            count_number_of_staking_payment_interval_from_startime_till_endtime: metrics.count_number_of_staking_payment_interval_from_startime_till_endtime,
            accumulated_timestamp_retrieved_at: metrics.accumulated_timestamp_retrieved_at,
            accumulated_datetime_retrieved_at: metrics.accumulated_datetime_retrieved_at
        };
    }

    const result = { normal: mapSummaryFields(normal) };
    if (pattern_2) {
        result.pattern_2 = mapSummaryFields(pattern_2);
    }
    return result;
}

/**
 * Validate staking data
 * @param {Object} stakingData - Staking data to validate
 * @returns {Object} Validation result with isValid boolean and errors array
 */
function validateStakingData(stakingData) {
    const errors = [];
    
    if (!stakingData.staking_amount || stakingData.staking_amount <= 0) {
        errors.push('Invalid staking amount');
    }
    
    if (!stakingData.staking_roi_interval_payment_amount || stakingData.staking_roi_interval_payment_amount < 0) {
        errors.push('Invalid ROI interval payment amount');
    }
    
    if (!stakingData.staking_roi_payment_interval || !TIMESTAMP_INTERVAL_VALUES[stakingData.staking_roi_payment_interval]) {
        errors.push('Invalid payment interval');
    }
    
    if (!stakingData.staking_roi_payment_startime_ts || stakingData.staking_roi_payment_startime_ts <= 0) {
        errors.push('Invalid start time');
    }
    
    if (!stakingData.staking_roi_payment_endtime_ts || stakingData.staking_roi_payment_endtime_ts <= 0) {
        errors.push('Invalid end time');
    }
    
    if (stakingData.staking_roi_payment_endtime_ts <= stakingData.staking_roi_payment_startime_ts) {
        errors.push('End time must be after start time');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Get formatted staking summary
 * @param {Object} stakingMetrics - Calculated staking metrics
 * @returns {Object} Formatted summary
 */
function getStakingSummary(stakingMetrics) {
    return {
        status: true,
        status_code: 200,
        message: "Staking ROI Interest Accumulated Retrieved",
        data: stakingMetrics
    };
}

/**
 * Calculate ROI percentage from amount and interval payment
 * @param {number} stakingAmount - Staking amount
 * @param {number} intervalPaymentAmount - Payment amount per interval
 * @returns {number} ROI percentage
 */
function calculateRoiPercentage(stakingAmount, intervalPaymentAmount) {
    if (stakingAmount <= 0) return 0;
    return (intervalPaymentAmount / stakingAmount) * 100;
}

/**
 * Calculate interval payment amount from percentage
 * @param {number} stakingAmount - Staking amount
 * @param {number} roiPercentage - ROI percentage
 * @returns {number} Interval payment amount
 */
function calculateIntervalPaymentAmount(stakingAmount, roiPercentage) {
    return (stakingAmount * roiPercentage) / 100;
}

/**
 * Check if staking contract has ended
 * @param {number} endTimeTs - End time timestamp
 * @returns {boolean} True if contract has ended
 */
function isStakingContractEnded(endTimeTs) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    return currentTimestamp >= endTimeTs;
}

/**
 * Get remaining time until staking contract ends
 * @param {number} endTimeTs - End time timestamp
 * @returns {number} Remaining seconds
 */
function getRemainingStakingTime(endTimeTs) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const remaining = endTimeTs - currentTimestamp;
    return remaining > 0 ? remaining : 0;
}

// Helper to format remaining seconds as human-readable string
function formatRemainingTime(seconds) {
    if (seconds <= 0) return 'Expired';
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    let parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (seconds > 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(', ') : '0 seconds';
}

module.exports = {
    TIMESTAMP_INTERVAL_VALUES,
    calculateStakingMetrics,
    calculateStakingMetricsFromMetaData,
    calculateAllStakingSummariesFromMetaData,
    validateStakingData,
    getStakingSummary,
    calculateRoiPercentage,
    calculateIntervalPaymentAmount,
    isStakingContractEnded,
    getRemainingStakingTime,
    formatRemainingTime
}; 
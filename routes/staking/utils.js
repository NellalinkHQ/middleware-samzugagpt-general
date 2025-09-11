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
/**
 * Get staking metrics for display purposes
 * @param {Object} stakingData - Staking data object
 * @param {number} [providedDatetime] - Optional specific datetime to calculate for
 * @returns {Object} Display metrics
 */
function getStakingMetrics(stakingData, providedDatetime = null) {
    const {
        staking_amount,
        staking_roi_interval_payment_amount,
        staking_roi_payment_interval,
        staking_roi_payment_startime_ts,
        staking_roi_payment_endtime_ts,
        staking_last_withdrawal_ts,
        staking_roi_full_payment_amount_at_end_of_contract,
        staking_roi_amount_withdrawn_so_far = 0,
        staking_plan_id,
        staking_capital_withdrawn_at
    } = stakingData;

    // Current timestamp
    const currentTimestamp = Math.floor(Date.now() / 1000);
    // Use provided datetime if available, otherwise use current time
    const calculationTimestamp = providedDatetime || currentTimestamp;
    // Get interval timestamp value
    const intervalTs = TIMESTAMP_INTERVAL_VALUES[staking_roi_payment_interval].ts;
    
    // Check if ROI should stop after capital withdrawal (based on meta field)
    const stop_roi_after_capital_withdrawal = stakingData.stop_roi_after_capital_withdrawal;
    if (stop_roi_after_capital_withdrawal && stop_roi_after_capital_withdrawal.toString().toLowerCase() === 'yes' && staking_capital_withdrawn_at && parseInt(staking_capital_withdrawn_at) > 0) {
        const capitalWithdrawnAt = parseInt(staking_capital_withdrawn_at);
        const effectiveEndTime = Math.min(staking_roi_payment_endtime_ts, capitalWithdrawnAt);
        
        // For display purposes, always count to current time (not capped)
        const count_number_of_staking_payment_interval_from_startime_till_now = 
            Math.floor((currentTimestamp - staking_roi_payment_startime_ts) / intervalTs);
        const count_number_of_staking_payment_interval_from_startime_till_provided_datetime = 
            Math.floor((calculationTimestamp - staking_roi_payment_startime_ts) / intervalTs);
        const count_number_of_staking_payment_interval_from_startime_till_endtime = 
            Math.floor((effectiveEndTime - staking_roi_payment_startime_ts) / intervalTs);
        
        // Calculate accumulated ROI for display (shows total accumulated, not capped for display)
        const intervalsForRoiCalculation = Math.floor((currentTimestamp - staking_roi_payment_startime_ts) / intervalTs);
        let accumulated_roi_now = intervalsForRoiCalculation * staking_roi_interval_payment_amount;
        const accumulated_roi_at_provided_datetime = count_number_of_staking_payment_interval_from_startime_till_provided_datetime * staking_roi_interval_payment_amount;
        
        // Cap accumulated ROI to never exceed the total ROI at end of contract
        if (accumulated_roi_now > staking_roi_full_payment_amount_at_end_of_contract) {
            accumulated_roi_now = staking_roi_full_payment_amount_at_end_of_contract;
        }
        
        // Calculate accumulated total amounts
        const accumulated_total_amount_now = staking_amount + accumulated_roi_now;
        const accumulated_total_amount_at_end_of_staking_contract = staking_amount + staking_roi_full_payment_amount_at_end_of_contract;

        // Calculate withdrawal-related values for display
        let accumulated_roi_user_can_withdraw_now = accumulated_roi_now - parseFloat(staking_roi_amount_withdrawn_so_far || 0);
        if (accumulated_roi_user_can_withdraw_now < 0) accumulated_roi_user_can_withdraw_now = 0;
        
        // Cap the withdrawable amount to never exceed the total ROI at end of contract
        const max_withdrawable = staking_roi_full_payment_amount_at_end_of_contract - parseFloat(staking_roi_amount_withdrawn_so_far || 0);
        if (accumulated_roi_user_can_withdraw_now > max_withdrawable) {
            accumulated_roi_user_can_withdraw_now = max_withdrawable;
        }
        
        let accumulated_roi_user_have_already_withdraw = parseFloat(staking_roi_amount_withdrawn_so_far || 0);

        // Calculate ROI remaining for user to withdraw before staking endtime
        const roi_remaining_for_user_to_withdraw_before_staking_endtime = 
            staking_roi_full_payment_amount_at_end_of_contract - parseFloat(staking_roi_amount_withdrawn_so_far || 0);

        // Format current datetime
        const datetime = new Date(currentTimestamp * 1000);
        const accumulated_datetime_retrieved_at = datetime.toLocaleString();

        return {
            count_number_of_staking_payment_interval_from_startime_till_now,
            count_number_of_staking_payment_interval_from_startime_till_provided_datetime,
            count_number_of_staking_payment_interval_from_startime_till_endtime,
            accumulated_roi_user_can_withdraw_now: formatAmountToDecimals(accumulated_roi_user_can_withdraw_now),
            accumulated_roi_user_have_already_withdraw: formatAmountToDecimals(accumulated_roi_user_have_already_withdraw),
            roi_remaining_for_user_to_withdraw_before_staking_endtime: formatAmountToDecimals(roi_remaining_for_user_to_withdraw_before_staking_endtime),
            accumulated_roi_now: formatAmountToDecimals(accumulated_roi_now),
            accumulated_total_amount_now: formatAmountToDecimals(accumulated_total_amount_now),
            accumulated_total_roi_at_end_of_staking_contract: formatAmountToDecimals(staking_roi_full_payment_amount_at_end_of_contract),
            accumulated_total_amount_at_end_of_staking_contract: formatAmountToDecimals(accumulated_total_amount_at_end_of_staking_contract),
            accumulated_timestamp_retrieved_at: currentTimestamp,
            accumulated_datetime_retrieved_at
        };
    } else {
        // PLANS 1 & 2 LOGIC: Standard ROI accumulation until contract end (Plan 4 follows Plan 3 logic)
        // For display purposes, use current time (shows real-time accumulation)
        const count_number_of_staking_payment_interval_from_startime_till_now = 
            Math.floor((currentTimestamp - staking_roi_payment_startime_ts) / intervalTs);
        const count_number_of_staking_payment_interval_from_startime_till_provided_datetime = 
            Math.floor((calculationTimestamp - staking_roi_payment_startime_ts) / intervalTs);
        const count_number_of_staking_payment_interval_from_startime_till_endtime = 
            Math.floor((staking_roi_payment_endtime_ts - staking_roi_payment_startime_ts) / intervalTs);
        
        // Calculate accumulated ROI for display (shows current accumulation)
        let accumulated_roi_now = count_number_of_staking_payment_interval_from_startime_till_now * staking_roi_interval_payment_amount;
        const accumulated_roi_at_provided_datetime = count_number_of_staking_payment_interval_from_startime_till_provided_datetime * staking_roi_interval_payment_amount;
        
        // Cap accumulated ROI to never exceed the total ROI at end of contract
        if (accumulated_roi_now > staking_roi_full_payment_amount_at_end_of_contract) {
            accumulated_roi_now = staking_roi_full_payment_amount_at_end_of_contract;
        }
        
        // Calculate accumulated total amounts
        const accumulated_total_amount_now = staking_amount + accumulated_roi_now;
        const accumulated_total_amount_at_end_of_staking_contract = staking_amount + staking_roi_full_payment_amount_at_end_of_contract;

        // Calculate withdrawal-related values for display
        let accumulated_roi_user_can_withdraw_now = accumulated_roi_now - parseFloat(staking_roi_amount_withdrawn_so_far || 0);
        if (accumulated_roi_user_can_withdraw_now < 0) accumulated_roi_user_can_withdraw_now = 0;
        
        // Cap the withdrawable amount to never exceed the total ROI at end of contract
        const max_withdrawable = staking_roi_full_payment_amount_at_end_of_contract - parseFloat(staking_roi_amount_withdrawn_so_far || 0);
        if (accumulated_roi_user_can_withdraw_now > max_withdrawable) {
            accumulated_roi_user_can_withdraw_now = max_withdrawable;
        }
        
        let accumulated_roi_user_have_already_withdraw = parseFloat(staking_roi_amount_withdrawn_so_far || 0);

        // Calculate ROI remaining for user to withdraw before staking endtime
        const roi_remaining_for_user_to_withdraw_before_staking_endtime = 
            staking_roi_full_payment_amount_at_end_of_contract - parseFloat(staking_roi_amount_withdrawn_so_far || 0);

        // Format current datetime
        const datetime = new Date(currentTimestamp * 1000);
        const accumulated_datetime_retrieved_at = datetime.toLocaleString();

        return {
            count_number_of_staking_payment_interval_from_startime_till_now,
            count_number_of_staking_payment_interval_from_startime_till_provided_datetime,
            count_number_of_staking_payment_interval_from_startime_till_endtime,
            accumulated_roi_user_can_withdraw_now: formatAmountToDecimals(accumulated_roi_user_can_withdraw_now),
            accumulated_roi_user_have_already_withdraw: formatAmountToDecimals(accumulated_roi_user_have_already_withdraw),
            roi_remaining_for_user_to_withdraw_before_staking_endtime: formatAmountToDecimals(roi_remaining_for_user_to_withdraw_before_staking_endtime),
            accumulated_roi_now: formatAmountToDecimals(accumulated_roi_now),
            accumulated_total_amount_now: formatAmountToDecimals(accumulated_total_amount_now),
            accumulated_total_roi_at_end_of_staking_contract: formatAmountToDecimals(staking_roi_full_payment_amount_at_end_of_contract),
            accumulated_total_amount_at_end_of_staking_contract: formatAmountToDecimals(accumulated_total_amount_at_end_of_staking_contract),
            accumulated_timestamp_retrieved_at: currentTimestamp,
            accumulated_datetime_retrieved_at
        };
    }
}

/**
 * Get staking ROI metrics for withdrawal purposes (strict logic)
 * @param {Object} stakingData - Staking data object
 * @returns {Object} ROI withdrawal metrics
 */
function getStakingROIMetrics(stakingData) {
    const {
        staking_amount,
        staking_roi_interval_payment_amount,
        staking_roi_payment_interval,
        staking_roi_payment_startime_ts,
        staking_roi_payment_endtime_ts,
        staking_last_withdrawal_ts,
        staking_roi_full_payment_amount_at_end_of_contract,
        staking_roi_amount_withdrawn_so_far = 0,
        staking_plan_id,
        staking_capital_withdrawn_at
    } = stakingData;

    // Current timestamp
    const currentTimestamp = Math.floor(Date.now() / 1000);
    // Get interval timestamp value
    const intervalTs = TIMESTAMP_INTERVAL_VALUES[staking_roi_payment_interval].ts;
    
    // Check if ROI should stop after capital withdrawal (based on meta field)
    const stop_roi_after_capital_withdrawal = stakingData.stop_roi_after_capital_withdrawal;
    if (stop_roi_after_capital_withdrawal && stop_roi_after_capital_withdrawal.toString().toLowerCase() === 'yes' && staking_capital_withdrawn_at && parseInt(staking_capital_withdrawn_at) > 0) {
        const capitalWithdrawnAt = parseInt(staking_capital_withdrawn_at);
        const effectiveEndTime = Math.min(staking_roi_payment_endtime_ts, capitalWithdrawnAt);
        
        // For withdrawal, use capital withdrawal time (ROI stops accumulating but can still be withdrawn)
        const withdrawalEffectiveNow = effectiveEndTime;
        
        // Calculate total accumulated ROI (consistent between display and withdrawal)
        const count_number_of_staking_payment_interval_from_startime_till_now_for_withdrawal = 
            Math.floor((withdrawalEffectiveNow - staking_roi_payment_startime_ts) / intervalTs);
        const total_accumulated_roi_for_withdrawal = count_number_of_staking_payment_interval_from_startime_till_now_for_withdrawal * staking_roi_interval_payment_amount;
        
        // Calculate withdrawal-related values
        let accumulated_roi_user_can_withdraw_now;
        let accumulated_roi_user_have_already_withdraw;
        
        // Always calculate based on total accumulated ROI minus what's already withdrawn
        // This ensures consistency and prevents calculation errors
        accumulated_roi_user_can_withdraw_now = total_accumulated_roi_for_withdrawal - parseFloat(staking_roi_amount_withdrawn_so_far || 0);
        accumulated_roi_user_have_already_withdraw = parseFloat(staking_roi_amount_withdrawn_so_far || 0);
        
        // Ensure withdrawable amount is not negative
        if (accumulated_roi_user_can_withdraw_now < 0) accumulated_roi_user_can_withdraw_now = 0;
        
        // Calculate ROI remaining for user to withdraw before staking endtime
        const roi_remaining_for_user_to_withdraw_before_staking_endtime = 
            staking_roi_full_payment_amount_at_end_of_contract - parseFloat(staking_roi_amount_withdrawn_so_far || 0);
        
        // Validate: withdrawn + remaining should equal total at end of contract
        const validation_sum = accumulated_roi_user_have_already_withdraw + roi_remaining_for_user_to_withdraw_before_staking_endtime;
        const validation_total = staking_roi_full_payment_amount_at_end_of_contract;
        
        return {
            accumulated_roi_user_can_withdraw_now: formatAmountToDecimals(accumulated_roi_user_can_withdraw_now),
            accumulated_roi_user_have_already_withdraw: formatAmountToDecimals(accumulated_roi_user_have_already_withdraw),
            roi_remaining_for_user_to_withdraw_before_staking_endtime: formatAmountToDecimals(roi_remaining_for_user_to_withdraw_before_staking_endtime),
            accumulated_roi_for_withdrawal: formatAmountToDecimals(accumulated_roi_user_can_withdraw_now + accumulated_roi_user_have_already_withdraw),
            count_number_of_staking_payment_interval_from_startime_till_now_for_withdrawal: Math.floor((withdrawalEffectiveNow - staking_roi_payment_startime_ts) / intervalTs),
            validation: {
                sum: formatAmountToDecimals(validation_sum),
                total: formatAmountToDecimals(validation_total),
                is_valid: Math.abs(validation_sum - validation_total) < 0.000001 // Allow for floating point precision
            }
        };
    } else {
        // PLANS 1 & 2 LOGIC: Standard ROI withdrawal until contract end (Plan 4 follows Plan 3 logic)
        // For withdrawal, use contract end time (strict - no accumulation after contract end)
        const withdrawalEffectiveNow = Math.min(currentTimestamp, staking_roi_payment_endtime_ts);
        
        // Calculate total accumulated ROI (consistent between display and withdrawal)
        const count_number_of_staking_payment_interval_from_startime_till_now_for_withdrawal = 
            Math.floor((withdrawalEffectiveNow - staking_roi_payment_startime_ts) / intervalTs);
        const total_accumulated_roi_for_withdrawal = count_number_of_staking_payment_interval_from_startime_till_now_for_withdrawal * staking_roi_interval_payment_amount;
        
        // Calculate withdrawal-related values
        let accumulated_roi_user_can_withdraw_now;
        let accumulated_roi_user_have_already_withdraw;
        
        // Always calculate based on total accumulated ROI minus what's already withdrawn
        // This ensures consistency and prevents calculation errors
        accumulated_roi_user_can_withdraw_now = total_accumulated_roi_for_withdrawal - parseFloat(staking_roi_amount_withdrawn_so_far || 0);
        accumulated_roi_user_have_already_withdraw = parseFloat(staking_roi_amount_withdrawn_so_far || 0);
        
        // Ensure withdrawable amount is not negative
        if (accumulated_roi_user_can_withdraw_now < 0) accumulated_roi_user_can_withdraw_now = 0;
        
        // Calculate ROI remaining for user to withdraw before staking endtime
        const roi_remaining_for_user_to_withdraw_before_staking_endtime = 
            staking_roi_full_payment_amount_at_end_of_contract - parseFloat(staking_roi_amount_withdrawn_so_far || 0);
        
        // Validate: withdrawn + remaining should equal total at end of contract
        const validation_sum = accumulated_roi_user_have_already_withdraw + roi_remaining_for_user_to_withdraw_before_staking_endtime;
        const validation_total = staking_roi_full_payment_amount_at_end_of_contract;
        
        return {
            accumulated_roi_user_can_withdraw_now: formatAmountToDecimals(accumulated_roi_user_can_withdraw_now),
            accumulated_roi_user_have_already_withdraw: formatAmountToDecimals(accumulated_roi_user_have_already_withdraw),
            roi_remaining_for_user_to_withdraw_before_staking_endtime: formatAmountToDecimals(roi_remaining_for_user_to_withdraw_before_staking_endtime),
            accumulated_roi_for_withdrawal: formatAmountToDecimals(accumulated_roi_user_can_withdraw_now + accumulated_roi_user_have_already_withdraw),
            count_number_of_staking_payment_interval_from_startime_till_now_for_withdrawal: Math.floor((withdrawalEffectiveNow - staking_roi_payment_startime_ts) / intervalTs),
            validation: {
                sum: formatAmountToDecimals(validation_sum),
                total: formatAmountToDecimals(validation_total),
                is_valid: Math.abs(validation_sum - validation_total) < 0.000001 // Allow for floating point precision
            }
        };
    }
}

/**
 * Get staking capital metrics for capital withdrawal purposes
 * @param {Object} stakingData - Staking data object
 * @returns {Object} Capital withdrawal metrics
 */
function getStakingCapitalMetrics(stakingData) {
    const {
        staking_amount,
        staking_capital_locked_duration_ts,
        staking_capital_withdrawn,
        staking_plan_id
    } = stakingData;

    // Current timestamp
    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    // Check if capital can be withdrawn instantly (based on meta field)
    const instant_capital_withdrawal = stakingData.instant_capital_withdrawal;
    if (instant_capital_withdrawal && instant_capital_withdrawal.toString().toLowerCase() === 'yes') {
        let can_withdraw_capital = true;
        
        // If capital has already been withdrawn, cannot withdraw again
        if (staking_capital_withdrawn && staking_capital_withdrawn.toString().toLowerCase() === 'yes') {
            can_withdraw_capital = false;
        }
        
        return {
            can_withdraw_capital,
            staking_amount: formatAmountToDecimals(staking_amount),
            current_timestamp: currentTimestamp,
            capital_locked_duration_ts: 0
        };
    } else {
        // PLANS 1 & 2 LOGIC: Capital locked for specific duration (Plan 4 follows Plan 3 logic)
        let can_withdraw_capital = false;
        
        // Check if lock duration has passed
        can_withdraw_capital = currentTimestamp >= staking_capital_locked_duration_ts;
        
        // If capital has already been withdrawn, cannot withdraw again
        if (staking_capital_withdrawn && staking_capital_withdrawn.toString().toLowerCase() === 'yes') {
            can_withdraw_capital = false;
        }
        
        return {
            can_withdraw_capital,
            staking_amount: formatAmountToDecimals(staking_amount),
            current_timestamp: currentTimestamp,
            capital_locked_duration_ts: staking_capital_locked_duration_ts
        };
    }
}

/**
 * Calculate staking metrics from staking meta data (for display)
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
        staking_roi_amount_withdrawn_so_far: parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far || 0),
        staking_plan_id: stakingMetaData.staking_plan_id,
        staking_capital_withdrawn_at: stakingMetaData.staking_capital_withdrawn_at,
        stop_roi_after_capital_withdrawal: stakingMetaData.stop_roi_after_capital_withdrawal,
        instant_capital_withdrawal: stakingMetaData.instant_capital_withdrawal
    };
    return getStakingMetrics(stakingData, providedDatetime);
}

/**
 * Calculate ROI metrics from staking meta data (for withdrawal)
 * @param {Object} stakingMetaData - Staking meta data from API
 * @returns {Object} ROI withdrawal metrics
 */
function calculateStakingROIMetricsFromMetaData(stakingMetaData) {
    const stakingData = {
        staking_amount: parseFloat(stakingMetaData.staking_amount),
        staking_roi_interval_payment_amount: parseFloat(stakingMetaData.staking_roi_interval_payment_amount),
        staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
        staking_roi_payment_startime_ts: parseInt(stakingMetaData.staking_roi_payment_startime_ts),
        staking_roi_payment_endtime_ts: parseInt(stakingMetaData.staking_roi_payment_endtime_ts),
        staking_last_withdrawal_ts: parseInt(stakingMetaData.staking_roi_last_withdrawal_ts) || 0,
        staking_roi_full_payment_amount_at_end_of_contract: parseFloat(stakingMetaData.staking_roi_full_payment_amount_at_end_of_contract),
        staking_roi_amount_withdrawn_so_far: parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far || 0),
        staking_plan_id: stakingMetaData.staking_plan_id,
        staking_capital_withdrawn_at: stakingMetaData.staking_capital_withdrawn_at,
        stop_roi_after_capital_withdrawal: stakingMetaData.stop_roi_after_capital_withdrawal,
        instant_capital_withdrawal: stakingMetaData.instant_capital_withdrawal
    };
    return getStakingROIMetrics(stakingData);
}

/**
 * Calculate ROI metrics from staking meta data for pattern_2 (for withdrawal)
 * @param {Object} stakingMetaData - Staking meta data from API
 * @returns {Object} ROI withdrawal metrics for pattern_2
 */
function calculateStakingROIMetricsFromMetaDataPattern2(stakingMetaData) {
    const stakingData = {
        staking_amount: parseFloat(stakingMetaData.staking_amount_internal_pattern_2),
        staking_roi_interval_payment_amount: parseFloat(stakingMetaData.staking_roi_interval_payment_amount_internal_pattern_2),
        staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
        staking_roi_payment_startime_ts: parseInt(stakingMetaData.staking_roi_payment_startime_ts_internal_pattern_2),
        staking_roi_payment_endtime_ts: parseInt(stakingMetaData.staking_roi_payment_endtime_ts_internal_pattern_2),
        staking_last_withdrawal_ts: parseInt(stakingMetaData.staking_roi_last_withdrawal_ts_internal_pattern_2) || 0,
        staking_roi_full_payment_amount_at_end_of_contract: parseFloat(stakingMetaData.staking_roi_full_payment_amount_at_end_of_contract_internal_pattern_2),
        staking_roi_amount_withdrawn_so_far: parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0),
        staking_plan_id: stakingMetaData.staking_plan_id,
        staking_capital_withdrawn_at: stakingMetaData.staking_capital_withdrawn_at
    };
    return getStakingROIMetrics(stakingData);
}

function formatAmountToDecimals(input, decimal_places = 8) {
    // Convert string to number if needed
    let num = typeof input === "string" ? Number(input) : input;
  
    if (isNaN(num)) {
      throw new Error("Invalid number input");
    }
  
    const factor = Math.pow(10, decimal_places);
  
    // Round to provided decimal places
    let rounded = Math.round(num * factor) / factor;
  
    // Convert to string without trailing zeros
    return Number(rounded.toString());
  }
  
  

/**
 * Calculate display metrics from staking meta data for pattern_2 (for display)
 * @param {Object} stakingMetaData - Staking meta data from API
 * @param {number} [providedDatetime] - Optional specific datetime to calculate for
 * @returns {Object} Display metrics for pattern_2
 */
function calculateStakingMetricsFromMetaDataPattern2(stakingMetaData, providedDatetime = null) {
    const stakingData = {
        staking_amount: parseFloat(stakingMetaData.staking_amount_internal_pattern_2),
        staking_roi_interval_payment_amount: parseFloat(stakingMetaData.staking_roi_interval_payment_amount_internal_pattern_2),
        staking_roi_payment_interval: stakingMetaData.staking_roi_payment_interval,
        staking_roi_payment_startime_ts: parseInt(stakingMetaData.staking_roi_payment_startime_ts_internal_pattern_2),
        staking_roi_payment_endtime_ts: parseInt(stakingMetaData.staking_roi_payment_endtime_ts_internal_pattern_2),
        staking_last_withdrawal_ts: parseInt(stakingMetaData.staking_roi_last_withdrawal_ts_internal_pattern_2) || 0,
        staking_roi_full_payment_amount_at_end_of_contract: parseFloat(stakingMetaData.staking_roi_full_payment_amount_at_end_of_contract_internal_pattern_2),
        staking_roi_amount_withdrawn_so_far: parseFloat(stakingMetaData.staking_roi_amount_withdrawn_so_far_internal_pattern_2 || 0),
        staking_plan_id: stakingMetaData.staking_plan_id,
        staking_capital_withdrawn_at: stakingMetaData.staking_capital_withdrawn_at
    };
    return getStakingMetrics(stakingData, providedDatetime);
}

/**
 * Calculate capital metrics from staking meta data (for capital withdrawal)
 * @param {Object} stakingMetaData - Staking meta data from API
 * @returns {Object} Capital withdrawal metrics
 */
function calculateStakingCapitalMetricsFromMetaData(stakingMetaData) {
    const stakingData = {
        staking_amount: parseFloat(stakingMetaData.staking_amount),
        staking_capital_locked_duration_ts: parseInt(stakingMetaData.staking_capital_locked_duration_ts || 0),
        staking_capital_withdrawn: stakingMetaData.staking_capital_withdrawn,
        staking_plan_id: stakingMetaData.staking_plan_id,
        instant_capital_withdrawal: stakingMetaData.instant_capital_withdrawal
    };
    return getStakingCapitalMetrics(stakingData);
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
            accumulated_roi_user_can_withdraw_now: metrics.accumulated_roi_user_can_withdraw_now,
            accumulated_roi_user_have_already_withdraw: metrics.accumulated_roi_user_have_already_withdraw,
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
    if (seconds <= 0) return 'Completed';
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
    // Display functions
    getStakingMetrics,
    calculateStakingMetricsFromMetaData,
    calculateStakingMetricsFromMetaDataPattern2,
    calculateAllStakingSummariesFromMetaData,
    // ROI withdrawal functions
    getStakingROIMetrics,
    calculateStakingROIMetricsFromMetaData,
    calculateStakingROIMetricsFromMetaDataPattern2,
    // Capital withdrawal functions
    getStakingCapitalMetrics,
    calculateStakingCapitalMetricsFromMetaData,
    // Utility functions
    validateStakingData,
    getStakingSummary,
    calculateRoiPercentage,
    calculateIntervalPaymentAmount,
    isStakingContractEnded,
    getRemainingStakingTime,
    formatRemainingTime,
    // Backward compatibility
    calculateStakingMetrics: getStakingMetrics
}; 
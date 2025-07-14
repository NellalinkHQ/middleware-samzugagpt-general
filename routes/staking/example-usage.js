/**
 * Example usage of staking utils.js
 * This file demonstrates how to use the utility functions
 */

const { 
    calculateStakingMetrics, 
    calculateStakingMetricsFromMetaData,
    getStakingSummary,
    validateStakingData 
} = require('./utils');

// Example 1: Calculate staking metrics with direct data
function exampleDirectCalculation() {
    // Sample staking data that would produce the values you mentioned
    const stakingData = {
        staking_amount: 10, // $10 staking amount
        staking_roi_interval_payment_amount: 0.1, // $0.1 per interval (1% of $10)
        staking_roi_payment_interval: 'every_second',
        staking_roi_payment_startime_ts: 1752405093 - 55548, // Start time that would give 55548 intervals
        staking_roi_payment_endtime_ts: 1752405093 - 55548 + 10, // End time 10 intervals later
        staking_last_withdrawal_ts: 0, // No previous withdrawal
        staking_roi_full_payment_amount_at_end_of_contract: 1 // $1 total ROI at end
    };

    // Validate the data first
    const validation = validateStakingData(stakingData);
    if (!validation.isValid) {
        console.error('Validation errors:', validation.errors);
        return;
    }

    // Calculate metrics
    const metrics = calculateStakingMetrics(stakingData);
    
    // Get formatted response
    const response = getStakingSummary(metrics);
    
    console.log('Example 1 - Direct calculation:');
    console.log(JSON.stringify(response, null, 2));
    
    return response;
}

// Example 2: Calculate from meta data (like from API response)
function exampleFromMetaData() {
    // Sample meta data from API response
    const stakingMetaData = {
        staking_amount: "10",
        staking_roi_interval_payment_amount: "0.1",
        staking_roi_payment_interval: "every_second",
        staking_roi_payment_startime_ts: "1752349545", // Start time
        staking_roi_payment_endtime_ts: "1752349555", // End time (10 seconds later)
        staking_roi_last_withdrawal_ts: "0",
        staking_roi_full_payment_amount_at_end_of_contract: "1"
    };

    // Calculate metrics from meta data
    const metrics = calculateStakingMetricsFromMetaData(stakingMetaData);
    
    console.log('Example 2 - From meta data:');
    console.log(JSON.stringify(metrics, null, 2));
    
    return metrics;
}

// Example 3: Calculate for a specific datetime
function exampleWithSpecificDatetime() {
    const stakingData = {
        staking_amount: 10,
        staking_roi_interval_payment_amount: 0.1,
        staking_roi_payment_interval: 'every_second',
        staking_roi_payment_startime_ts: 1752405093 - 55548,
        staking_roi_payment_endtime_ts: 1752405093 - 55548 + 10,
        staking_last_withdrawal_ts: 0,
        staking_roi_full_payment_amount_at_end_of_contract: 1
    };

    // Calculate for a specific datetime (1 second before current time)
    const specificDatetime = Math.floor(Date.now() / 1000) - 1;
    const metrics = calculateStakingMetrics(stakingData, specificDatetime);
    
    console.log('Example 3 - With specific datetime:');
    console.log(JSON.stringify(metrics, null, 2));
    
    return metrics;
}

// Example 4: Real-world usage in an API endpoint
function exampleApiUsage() {
    // This is how you would use it in your existing staking-accumulated-roi.js
    const mockStakingMetaResponse = {
        data: {
            data: {
                staking_amount: "10",
                staking_roi_interval_payment_amount: "0.1",
                staking_roi_payment_interval: "every_second",
                staking_roi_payment_startime_ts: "1752349545",
                staking_roi_payment_endtime_ts: "1752349555",
                staking_roi_last_withdrawal_ts: "0",
                staking_roi_full_payment_amount_at_end_of_contract: "1"
            }
        }
    };

    // Extract data from API response
    const stakingMetaData = mockStakingMetaResponse.data.data;
    
    // Calculate metrics using utility function
    const metrics = calculateStakingMetricsFromMetaData(stakingMetaData);
    
    // Return formatted response
    const response = getStakingSummary(metrics);
    
    console.log('Example 4 - API usage:');
    console.log(JSON.stringify(response, null, 2));
    
    return response;
}

// Run examples
if (require.main === module) {
    console.log('=== Staking Utils Examples ===\n');
    
    exampleDirectCalculation();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleFromMetaData();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleWithSpecificDatetime();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleApiUsage();
}

module.exports = {
    exampleDirectCalculation,
    exampleFromMetaData,
    exampleWithSpecificDatetime,
    exampleApiUsage
}; 
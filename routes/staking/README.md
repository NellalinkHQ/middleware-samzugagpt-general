# Staking Module

This directory contains utility functions and API endpoints for staking-related operations.

## Files

- `utils.js` - Main utility functions for staking calculations
- `example-usage.js` - Examples of how to use the utility functions
- `staking-accumulated-roi-refactored.js` - Example of how to refactor existing code to use utils
- `get-staking.js` - Enhanced staking history API (replacement for get-staking-history.js)

---

# Utils.js Documentation

## Main Functions

### `calculateStakingMetrics(stakingData, providedDatetime)`

Calculates all staking metrics including payment intervals, accumulated ROI, and withdrawal amounts.

**Parameters:**
- `stakingData` (Object): Staking data object with the following properties:
  - `staking_amount` (number): Original staking amount
  - `staking_roi_interval_payment_amount` (number): ROI payment amount per interval
  - `staking_roi_payment_interval` (string): Payment interval (e.g., 'every_second')
  - `staking_roi_payment_startime_ts` (number): Start time timestamp
  - `staking_roi_payment_endtime_ts` (number): End time timestamp
  - `staking_last_withdrawal_ts` (number): Last withdrawal timestamp (0 if no withdrawal)
  - `staking_roi_full_payment_amount_at_end_of_contract` (number): Total ROI at end of contract
- `providedDatetime` (number, optional): Specific datetime to calculate for (timestamp in seconds)

**Returns:**
```javascript
{
  count_number_of_staking_payment_interval_from_startime_till_now: 55548,
  count_number_of_staking_payment_interval_from_startime_till_provided_datetime: 55547,
  count_number_of_staking_payment_interval_from_startime_till_endtime: 10,
  checks: 55548,
  accumulated_roi_user_can_withdraw_now: 5554.8,
  accumulated_roi_user_have_already_withdraw: 0,
  accumulated_roi_now: 5554.8,
  accumulated_total_amount_now: 5564.8,
  accumulated_total_roi_at_end_of_staking_contract: 1,
  accumulated_total_amount_at_end_of_staking_contract: 11,
  accumulated_timestamp_retrieved_at: 1752405093,
  accumulated_datetime_retrieved_at: "7/13/2025, 12:11:33 PM"
}
```

### `calculateStakingMetricsFromMetaData(stakingMetaData, providedDatetime)`

Calculates staking metrics from API response meta data.

**Parameters:**
- `stakingMetaData` (Object): Meta data from API response (strings will be parsed to numbers)
- `providedDatetime` (number, optional): Specific datetime to calculate for

**Returns:** Same as `calculateStakingMetrics`

### `validateStakingData(stakingData)`

Validates staking data for required fields and logical consistency.

**Parameters:**
- `stakingData` (Object): Staking data to validate

**Returns:**
```javascript
{
  isValid: true,
  errors: []
}
```

### `getStakingSummary(stakingMetrics)`

Formats staking metrics into a standard API response format.

**Parameters:**
- `stakingMetrics` (Object): Calculated staking metrics

**Returns:**
```javascript
{
  status: true,
  status_code: 200,
  message: "Staking ROI Interest Accumulated Retrieved",
  data: stakingMetrics
}
```

## Utils Usage Examples

### Basic Usage

```javascript
const { calculateStakingMetrics } = require('./utils');

const stakingData = {
  staking_amount: 10,
  staking_roi_interval_payment_amount: 0.1,
  staking_roi_payment_interval: 'every_second',
  staking_roi_payment_startime_ts: 1752405093 - 55548,
  staking_roi_payment_endtime_ts: 1752405093 - 55548 + 10,
  staking_last_withdrawal_ts: 0,
  staking_roi_full_payment_amount_at_end_of_contract: 1
};

const metrics = calculateStakingMetrics(stakingData);
console.log(metrics);
```

### From API Response

```javascript
const { calculateStakingMetricsFromMetaData, getStakingSummary } = require('./utils');

// After getting staking meta data from API
const stakingMetaData = stakingMetaResponse.data.data;
const metrics = calculateStakingMetricsFromMetaData(stakingMetaData);
const response = getStakingSummary(metrics);

res.send(response);
```

### With Validation

```javascript
const { calculateStakingMetrics, validateStakingData } = require('./utils');

const validation = validateStakingData(stakingData);
if (!validation.isValid) {
  console.error('Validation errors:', validation.errors);
  return;
}

const metrics = calculateStakingMetrics(stakingData);
```

## Supported Payment Intervals

- `every_second` - 1 second intervals
- `every_minute` - 60 second intervals
- `every_hour` - 3600 second intervals
- `every_day` - 86400 second intervals
- `every_week` - 604800 second intervals
- `every_month` - 2592000 second intervals
- `every_year` - 31536000 second intervals

---

# Get-Staking.js Documentation

Enhanced staking history retrieval API that uses the new `utils.js` functions and includes several improvements over the original `get-staking-history.js`.

## 🚀 Key Enhancements

### 1. **Utils Integration**
- Uses `calculateStakingMetricsFromMetaData()` for consistent calculations
- Leverages `validateStakingData()` for data validation
- Utilizes `isStakingContractEnded()` and `getRemainingStakingTime()` for contract status

### 2. **Improved Error Handling**
- Comprehensive parameter validation
- Better error messages with context
- Proper HTTP status codes
- Request timeout handling

### 3. **Caching System**
- In-memory cache for staking meta data (30-second TTL)
- Reduces API calls to external services
- Improves response times

### 4. **Enhanced Pagination**
- Better pagination logic with proper bounds checking
- Pagination metadata in response
- Support for large datasets

### 5. **Flexible Response Options**
- Optional summary inclusion
- Optional contract status information
- Configurable data fields

### 6. **Contract Status Information**
- Real-time contract progress
- Remaining time calculation
- Progress percentage
- Human-readable time formatting

## 📋 API Endpoint

```
GET /staking/:stakingTransactionID
```

## 🔧 Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `user_id` | number | 0 | User ID (optional) |
| `per_page` | number | 10 | Records per page (1-100) |
| `page_no` | number | 1 | Page number (≥1) |
| `count_for_provided_datetime_ts` | number | current time | Specific datetime to calculate for |
| `order` | string | "DESC" | Sort order ("ASC" or "DESC") |
| `include_summary` | boolean | true | Include staking summary in response |
| `include_contract_status` | boolean | true | Include contract status information |

## 📤 Response Format

### Success Response (200)

```json
{
  "status": true,
  "status_code": 200,
  "message": "Staking ROI Interest Retrieved Successfully",
  "data": {
    "roi_history": [
      {
        "staking_roi_accumulation_id": 1,
        "staking_roi_accumulation_interval": "every_second",
        "staking_roi_accumulation_wallet_id": "usdt",
        "staking_roi_accumulation_amount": 0.1,
        "staking_roi_accumulation_amount_formatted": "usdt 0.1",
        "staking_roi_accumulation_interval_paid_at": "Second 1",
        "staking_roi_accumulation_datetime_ts": 1752349546,
        "staking_roi_accumulation_formatted_datetime": "7/13/2025, 12:11:33 PM",
        "staking_roi_accumulation_status": "paid",
        "staking_roi_accumulation_wallet_id_internal_pattern_2": "btc",
        "staking_roi_accumulation_amount_internal_pattern_2": 0.001,
        "staking_roi_accumulation_amount_formatted_internal_pattern_2": "btc 0.001"
      }
    ],
    "summary": {
      "count_number_of_staking_payment_interval_from_startime_till_now": 55548,
      "count_number_of_staking_payment_interval_from_startime_till_provided_datetime": 55547,
      "count_number_of_staking_payment_interval_from_startime_till_endtime": 10,
      "checks": 55548,
      "accumulated_roi_user_can_withdraw_now": 5554.8,
      "accumulated_roi_user_have_already_withdraw": 0,
      "accumulated_roi_now": 5554.8,
      "accumulated_total_amount_now": 5564.8,
      "accumulated_total_roi_at_end_of_staking_contract": 1,
      "accumulated_total_amount_at_end_of_staking_contract": 11,
      "accumulated_timestamp_retrieved_at": 1752405093,
      "accumulated_datetime_retrieved_at": "7/13/2025, 12:11:33 PM",
      "staking_amount": 10,
      "staking_roi_interval_payment_amount": 0.1,
      "staking_roi_interval_payment_percentage": "1%",
      "staking_roi_payment_interval": "every_second",
      "staking_roi_payment_startime_ts": 1752349545,
      "staking_roi_payment_endtime_ts": 1752349555,
      "staking_roi_payment_pattern": "internal_pattern_2"
    },
    "contract_status": {
      "is_ended": false,
      "remaining_seconds": 86400,
      "remaining_formatted": "1d 0h 0m 0s",
      "progress_percentage": 85
    }
  },
  "meta": {
    "pagination": {
      "current_page": 1,
      "per_page": 10,
      "total": 100,
      "total_intervals": 100,
      "total_pages": 10,
      "last_page": 10,
      "has_next_page": true,
      "has_previous_page": false
    }
  }
}
```

### Error Response (400/404/500)

```json
{
  "status": false,
  "status_code": 400,
  "message": "Invalid query parameters",
  "error": ["per_page must be between 1 and 100"]
}
```

## 🔍 Usage Examples

### Basic Usage

```bash
GET /staking/12345
```

### With Pagination

```bash
GET /staking/12345?per_page=20&page_no=2
```

### With Specific Datetime

```bash
GET /staking/12345?count_for_provided_datetime_ts=1752405093
```

### Ascending Order

```bash
GET /staking/12345?order=ASC
```

### Without Summary

```bash
GET /staking/12345?include_summary=false
```

### Without Contract Status

```bash
GET /staking/12345?include_contract_status=false
```

### Complete Example

```bash
GET /staking/12345?per_page=15&page_no=1&order=DESC&include_summary=true&include_contract_status=true&count_for_provided_datetime_ts=1752405093
```

## 🔧 Integration with Existing Code

### 1. Update Router

In your `routes/staking/index.js`, replace:

```javascript
/* Get Staking ROI History */
router.use('/', userJWTSecurityCheck, require('./get-staking-history'));
```

With:

```javascript
/* Get Staking ROI History */
router.use('/', userJWTSecurityCheck, require('./get-staking'));
```

### 2. Environment Variables

Ensure these environment variables are set:

```bash
MODULE1_STAKING_BASE_URL=https://your-api-base-url.com
MODULE1_STAKING_API_KEY=your-api-key
```

## 🛠️ Technical Features

### Caching

- **Cache TTL**: 30 seconds
- **Cache Key**: `staking_meta_${stakingTransactionID}`
- **Cache Type**: In-memory Map (for production, consider Redis)

### Validation

- Query parameter validation
- Staking data validation using utils
- Datetime range validation
- Pagination bounds checking

### Error Handling

- Network timeout (10 seconds)
- API error responses
- Validation errors
- Not found errors

### Performance Optimizations

- Caching reduces external API calls
- Efficient pagination calculation
- Minimal data processing
- Proper memory management

## 🔄 Migration from get-staking-history.js

### Breaking Changes

1. **Response Structure**: Enhanced with pagination and optional sections
2. **Query Parameters**: New parameters with different defaults
3. **Error Handling**: More detailed error responses

### Backward Compatibility

To maintain backward compatibility, you can:

1. **Keep both endpoints** temporarily
2. **Add compatibility layer** in the new endpoint
3. **Gradually migrate** frontend calls

### Migration Checklist

- [ ] Update router configuration
- [ ] Test all existing API calls
- [ ] Update frontend pagination logic
- [ ] Update error handling in frontend
- [ ] Monitor performance improvements
- [ ] Remove old endpoint after migration

## 🧪 Testing

### Test Cases

1. **Basic functionality**
2. **Pagination edge cases**
3. **Invalid parameters**
4. **Network errors**
5. **Cache behavior**
6. **Contract status calculations**

### Example Test Request

```bash
curl -X GET "http://localhost:3000/staking/12345?per_page=5&page_no=1&order=DESC" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📊 Performance Metrics

### Expected Improvements

- **Response Time**: 30-50% faster due to caching
- **API Calls**: 70% reduction in external API calls
- **Memory Usage**: Minimal increase due to caching
- **Error Rate**: Reduced due to better validation

### Monitoring

Monitor these metrics after deployment:

- Average response time
- Cache hit rate
- Error rate
- Memory usage
- API call frequency

## 🔮 Future Enhancements

### Planned Features

1. **Redis Caching**: Replace in-memory cache with Redis
2. **Rate Limiting**: Add rate limiting per user
3. **WebSocket Updates**: Real-time contract status updates
4. **Analytics**: Staking performance analytics
5. **Export**: CSV/JSON export functionality

### Configuration Options

Future configuration options could include:

- Cache TTL configuration
- Rate limiting settings
- Pagination defaults
- Response format options
- Logging levels

---

## Integration with Existing Code

To integrate utils with your existing `staking-accumulated-roi.js`:

1. Import the utility functions:
```javascript
const { 
  calculateStakingMetricsFromMetaData, 
  getStakingSummary,
  validateStakingData 
} = require('./utils');
```

2. Replace the calculation logic with:
```javascript
const stakingMetrics = calculateStakingMetricsFromMetaData(stakingMetaData);
const response = getStakingSummary(stakingMetrics);
```

3. Add validation if needed:
```javascript
const validation = validateStakingData(stakingData);
if (!validation.isValid) {
  // Handle validation errors
}
```

## Testing

Run the example file to see the utils in action:

```bash
node routes/staking/example-usage.js
```

This will show you various examples of how to use the utility functions and the expected output format. 
# Vapi Boards Setup Guide

Boards is Vapi's built-in analytics dashboard available at [dashboard.vapi.ai](https://dashboard.vapi.ai). It provides drag-and-drop widgets for visualizing call data in real time.

> **Note**: Boards are a UI-only feature in the Vapi Dashboard. They cannot be created or managed via API. The underlying data uses the same `POST /analytics` endpoint that our backend calls programmatically.

## Accessing Boards

1. Log in to [dashboard.vapi.ai](https://dashboard.vapi.ai)
2. Click **Boards** in the left sidebar (under Reporting/Analytics)
3. Your board is created automatically on first visit

## Recommended Dashboard Widgets

### 1. Total Calls Today (Text Widget)

- **Type**: Text
- **Data Source**: Calls
- **Metric**: Count of Call ID
- **Time Range**: Last 24 hours
- **Name**: "Total Calls Today"

### 2. Total Calls This Week (Text Widget)

- **Type**: Text
- **Data Source**: Calls
- **Metric**: Count of Call ID
- **Time Range**: Last 7 days
- **Name**: "Total Calls This Week"

### 3. Average Call Duration (Text Widget)

- **Type**: Text
- **Data Source**: Calls
- **Metric**: Avg of Duration
- **Time Range**: Last 7 days
- **Name**: "Avg Call Duration"

### 4. Total Cost (Text Widget)

- **Type**: Text
- **Data Source**: Calls
- **Metric**: Sum of Cost
- **Time Range**: Last 30 days
- **Name**: "Total Cost (30d)"

### 5. Call Volume Trend (Line Chart)

- **Type**: Line Chart
- **Data Source**: Calls
- **Metric**: Count of Call ID
- **Time Range**: Last 30 days
- **Group By Time**: Day
- **Name**: "Call Volume Trend"

### 6. Calls by Assistant (Bar Chart)

- **Type**: Bar Chart
- **Data Source**: Calls
- **Metric**: Count of Call ID
- **Time Range**: Last 7 days
- **Group By**: Assistant
- **Group By Time**: Day
- **Name**: "Calls by Assistant"

### 7. Calls by Status (Pie Chart)

- **Type**: Pie Chart
- **Data Source**: Calls
- **Metric**: Count of Call ID
- **Time Range**: Last 7 days
- **Group By**: Status
- **Name**: "Calls by Status"

### 8. Calls by Ended Reason (Pie Chart)

- **Type**: Pie Chart
- **Data Source**: Calls
- **Metric**: Count of Call ID
- **Time Range**: Last 7 days
- **Group By**: Ended Reason
- **Name**: "Call End Reasons"

### 9. Booking Rate (Calculated Metric)

Use formula mode to compute a booking rate:

1. Click **Add Widget** -> **Text**
2. Enable **Formula Mode**
3. Add first query:
   - **Query Name**: `totalBookings`
   - **Metric**: Count of Call ID
   - **Filter**: Status = "ended" (add additional filter for successful evaluation if using `analysis.successEvaluation`)
4. Add second query:
   - **Query Name**: `totalCalls`
   - **Metric**: Count of Call ID
5. Enter formula: `({{totalBookings}} / {{totalCalls}}) * 100`
6. **Name**: "Booking Rate (%)"

### 10. Cost Per Call (Calculated Metric)

1. Click **Add Widget** -> **Text**
2. Enable **Formula Mode**
3. First query: `totalCost` = Sum of Cost
4. Second query: `totalCalls` = Count of Call ID
5. Formula: `{{totalCost}} / {{totalCalls}}`
6. **Name**: "Avg Cost Per Call"

## Layout Recommendations

Arrange widgets in this visual hierarchy (top to bottom):

```
Row 1 (KPIs):     [Total Today] [Total Week] [Avg Duration] [Total Cost]
Row 2 (Trends):   [         Call Volume Trend (wide)        ]
Row 3 (Details):  [Calls by Assistant] [Calls by Status] [End Reasons]
Row 4 (Rates):    [Booking Rate]       [Cost Per Call]
```

- KPI cards: 1-2 column widths
- Charts: 3-4 column widths
- The grid is 6 columns wide

## Filtering Tips

- Use **global time range** at the top to control all widgets at once
- Add per-widget filters for specific segments:
  - `Status = ended` to exclude in-progress calls
  - `Assistant ID = <id>` to filter by specific assistant
  - `Cost > 0` to exclude zero-cost test calls

## Structured Output Queries

When structured outputs are linked to assistants (via the standalone Structured Output API), Vapi extracts structured data from each call. While the `POST /analytics` API does not directly support grouping by structured output fields, you can:

1. Use `analysis.successEvaluation` as a groupBy field if you configure success evaluation in your structured outputs
2. Use `groupByVariableValue` with variable keys for custom grouping
3. View individual call structured data in the Vapi Dashboard Calls section

Our application handles structured output analysis (outcomes, insurance, payments) via the `GET /api/analytics/calls` endpoint, which fetches recent calls and parses their `analysis.structuredData` field server-side.

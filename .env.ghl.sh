#!/bin/bash
# GoHighLevel environment variables for Docker Compose
# Source this file before running docker-compose: source .env.ghl.sh

export GHL_API_KEY="pit-8a1eae7c-9011-479c-ab50-274754b3ae0b"
export GHL_LOCATION_ID="dIKzdXsNArISLRIrOnHI"
export NEXT_PUBLIC_GHL_WIDGET_ID="69795c937894ccd5ccb0ff29"
export NEXT_PUBLIC_GHL_LOCATION_ID="dIKzdXsNArISLRIrOnHI"
export NEXT_PUBLIC_GHL_CALENDAR_ID="B2oaZWJp94EHuPRt1DQL"

echo "✅ GHL environment variables exported"
echo "   Run 'docker-compose up' to start with GHL integration"

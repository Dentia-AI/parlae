#!/bin/bash
# GoHighLevel environment variables for Docker Compose
# Source this file before running docker-compose: source .env.ghl.sh

export GHL_API_KEY="pit-8a1eae7c-9011-479c-ab50-274754b3ae0b"
export GHL_LOCATION_ID="J37kckNEAfKpTFpUSEah"
export NEXT_PUBLIC_GHL_WIDGET_ID="691e8abd467a1f1c86f74fbf"
export NEXT_PUBLIC_GHL_LOCATION_ID="J37kckNEAfKpTFpUSEah"
export NEXT_PUBLIC_GHL_CALENDAR_ID="VOACGbH1cvMBqNCyQjzw"

echo "✅ GHL environment variables exported"
echo "   Run 'docker-compose up' to start with GHL integration"

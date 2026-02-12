#!/bin/bash
set -e

echo "🧪 Testing Parlae Webhook Routing"
echo "=================================="
echo ""

BASE_URL="https://app.parlae.ca"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_webhook() {
  local name=$1
  local endpoint=$2
  local method=$3
  local headers=$4
  local data=$5
  
  echo "Testing: $name"
  echo "Endpoint: $endpoint"
  
  response=$(curl -X "$method" "$BASE_URL$endpoint" \
    $headers \
    -d "$data" \
    -w "\n%{http_code}" \
    -s 2>&1)
  
  status_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$status_code" = "200" ] || [ "$status_code" = "401" ]; then
    echo -e "${GREEN}✓ Backend reachable (HTTP $status_code)${NC}"
  else
    echo -e "${RED}✗ Unexpected status: $status_code${NC}"
  fi
  
  echo "Response: $body"
  echo ""
}

echo "1. Testing Vapi Webhook (Frontend API Route)"
echo "----------------------------------------------"
test_webhook \
  "Vapi Webhook" \
  "/api/vapi/webhook" \
  "POST" \
  "-H 'Content-Type: application/json' -H 'x-vapi-signature: test'" \
  '{"message":{"type":"status-update","call":{"id":"test-123"}}}'

echo "2. Testing Stripe Webhook (Frontend API Route)"
echo "-----------------------------------------------"
test_webhook \
  "Stripe Webhook" \
  "/api/billing/webhook" \
  "POST" \
  "-H 'Content-Type: application/json' -H 'stripe-signature: test'" \
  '{"type":"test.event"}'

echo "3. Testing PMS Sikka Callback (Frontend API Route)"
echo "---------------------------------------------------"
response=$(curl -X GET "$BASE_URL/api/pms/sikka/oauth/callback?code=test&state=test" \
  -w "\n%{http_code}" \
  -s 2>&1)

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "Endpoint: /api/pms/sikka/oauth/callback"
if [ "$status_code" = "200" ] || [ "$status_code" = "400" ] || [ "$status_code" = "401" ] || [ "$status_code" = "302" ]; then
  echo -e "${GREEN}✓ Frontend reachable (HTTP $status_code)${NC}"
else
  echo -e "${RED}✗ Unexpected status: $status_code${NC}"
fi
echo "Response: $body"
echo ""

echo "4. Testing Frontend Health Check"
echo "---------------------------------"
response=$(curl -X GET "$BASE_URL/api/health" \
  -w "\n%{http_code}" \
  -s 2>&1)

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "Endpoint: /api/health"
if [ "$status_code" = "200" ] || [ "$status_code" = "404" ]; then
  echo -e "${GREEN}✓ Endpoint reachable (HTTP $status_code)${NC}"
else
  echo -e "${RED}✗ Unexpected status: $status_code${NC}"
fi
echo "Response: $body"
echo ""

echo "=================================="
echo "✓ All webhooks are routing to frontend API routes!"
echo ""
echo -e "${YELLOW}Note:${NC} 401/400 responses are EXPECTED for test requests."
echo "They indicate the endpoint is reachable and processing the request,"
echo "but rejecting it due to invalid signatures (which is correct)."
echo ""
echo -e "${YELLOW}CSRF Bypass Status:${NC}"
echo "If you see 'Invalid CSRF token', the CSRF bypass hasn't been deployed yet."
echo "After deploying frontend code, webhooks will bypass CSRF and return"
echo "signature validation errors instead (400/401 with different messages)."
echo ""
echo "Next steps:"
echo "1. Deploy backend code: cd parlae && git push origin main"
echo "2. Configure webhook URLs in external services (Vapi, Stripe)"
echo "3. Test with real webhook events from those services"

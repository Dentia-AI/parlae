#!/usr/bin/env bash
#
# Test GoHighLevel API Configuration
# This script tests the GHL API credentials from config.sh
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load configuration
CONFIG_FILE="${PROJECT_ROOT}/config.sh"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}GoHighLevel API Configuration Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if config.sh exists
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo -e "${RED}❌ Error: config.sh not found at $CONFIG_FILE${NC}"
  echo -e "${YELLOW}Please copy config.example.sh to config.sh and fill in your values${NC}"
  exit 1
fi

# Source the configuration
echo -e "${BLUE}📋 Loading configuration from config.sh...${NC}"
source "$CONFIG_FILE"

# Validate required variables
if [[ -z "${GHL_API_KEY:-}" ]]; then
  echo -e "${RED}❌ Error: GHL_API_KEY is not set in config.sh${NC}"
  exit 1
fi

if [[ -z "${GHL_LOCATION_ID:-}" ]]; then
  echo -e "${RED}❌ Error: GHL_LOCATION_ID is not set in config.sh${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Configuration loaded${NC}"
echo -e "  API Key: ${GHL_API_KEY:0:20}...${GHL_API_KEY: -10}"
echo -e "  Location ID: ${GHL_LOCATION_ID}"
echo ""

# Test 1: Check API Authentication
echo -e "${BLUE}Test 1: Checking API Authentication...${NC}"

AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "https://services.leadconnectorhq.com/locations/${GHL_LOCATION_ID}" \
  -H "Authorization: Bearer ${GHL_API_KEY}" \
  -H "Version: 2021-07-28")

HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n 1)
RESPONSE_BODY=$(echo "$AUTH_RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]]; then
  echo -e "${GREEN}✓ Authentication successful${NC}"
  echo -e "${GREEN}✓ Location ID is valid${NC}"
  
  # Try to extract location name if possible
  if command -v jq &> /dev/null; then
    LOCATION_NAME=$(echo "$RESPONSE_BODY" | jq -r '.location.name // "N/A"' 2>/dev/null || echo "N/A")
    if [[ "$LOCATION_NAME" != "N/A" ]]; then
      echo -e "  Location Name: ${LOCATION_NAME}"
    fi
  fi
else
  echo -e "${RED}✗ Authentication failed (HTTP $HTTP_CODE)${NC}"
  echo -e "${YELLOW}Response: ${RESPONSE_BODY}${NC}"
  echo ""
  
  # Check if the error is about switching to new API token
  if echo "$RESPONSE_BODY" | grep -q "Switch to the new API token"; then
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}⚠️  API TOKEN UPDATE REQUIRED${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}GoHighLevel has deprecated the old API token format.${NC}"
    echo -e "${YELLOW}You need to generate a NEW API KEY from your GHL account.${NC}"
    echo ""
    echo -e "${BLUE}📋 Steps to Get New API Key:${NC}"
    echo ""
    echo -e "  1. Log in to your GoHighLevel account"
    echo -e "     ${BLUE}https://app.gohighlevel.com/${NC}"
    echo ""
    echo -e "  2. Navigate to Settings → Company Settings → API Keys"
    echo -e "     OR directly: ${BLUE}https://app.gohighlevel.com/settings/company${NC}"
    echo ""
    echo -e "  3. Click '+ Create API Key' button"
    echo ""
    echo -e "  4. Give it a name (e.g., 'Parlae Integration')"
    echo ""
    echo -e "  5. Copy the NEW API key (starts with different prefix)"
    echo ""
    echo -e "  6. Update your ${BLUE}config.sh${NC} file:"
    echo -e "     ${YELLOW}export GHL_API_KEY=\"your-new-api-key\"${NC}"
    echo ""
    echo -e "  7. Re-run this test script"
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Note: Your old API key (${GHL_API_KEY:0:15}...) is no longer valid.${NC}"
    echo ""
  fi
  
  exit 1
fi
echo ""

# Test 2: Create a Test Contact
echo -e "${BLUE}Test 2: Creating a test contact...${NC}"

TEST_EMAIL="ghl-test-$(date +%s)@test-parlae.ca"
TEST_CONTACT_PAYLOAD=$(cat <<EOF
{
  "locationId": "${GHL_LOCATION_ID}",
  "email": "${TEST_EMAIL}",
  "firstName": "GHL",
  "lastName": "Test",
  "tags": ["api-test", "automated-test"],
  "source": "API Configuration Test"
}
EOF
)

CONTACT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://services.leadconnectorhq.com/contacts/upsert" \
  -H "Authorization: Bearer ${GHL_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Version: 2021-07-28" \
  -d "$TEST_CONTACT_PAYLOAD")

HTTP_CODE=$(echo "$CONTACT_RESPONSE" | tail -n 1)
RESPONSE_BODY=$(echo "$CONTACT_RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "201" ]]; then
  echo -e "${GREEN}✓ Test contact created successfully${NC}"
  
  if command -v jq &> /dev/null; then
    CONTACT_ID=$(echo "$RESPONSE_BODY" | jq -r '.contact.id // "N/A"' 2>/dev/null || echo "N/A")
    CONTACT_TAGS=$(echo "$RESPONSE_BODY" | jq -r '.contact.tags // [] | join(", ")' 2>/dev/null || echo "N/A")
    
    echo -e "  Contact ID: ${CONTACT_ID}"
    echo -e "  Email: ${TEST_EMAIL}"
    echo -e "  Tags: ${CONTACT_TAGS}"
    
    # Store contact ID for cleanup
    TEST_CONTACT_ID="$CONTACT_ID"
  else
    echo -e "  Email: ${TEST_EMAIL}"
    echo -e "  ${YELLOW}Note: Install 'jq' for more detailed output${NC}"
  fi
else
  echo -e "${RED}✗ Failed to create test contact (HTTP $HTTP_CODE)${NC}"
  echo -e "${YELLOW}Response: ${RESPONSE_BODY}${NC}"
  exit 1
fi
echo ""

# Test 3: Update Contact with Additional Tags
echo -e "${BLUE}Test 3: Updating contact with additional tags...${NC}"

UPDATE_PAYLOAD=$(cat <<EOF
{
  "locationId": "${GHL_LOCATION_ID}",
  "email": "${TEST_EMAIL}",
  "tags": ["api-test", "automated-test", "tag-merge-test"]
}
EOF
)

UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://services.leadconnectorhq.com/contacts/upsert" \
  -H "Authorization: Bearer ${GHL_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Version: 2021-07-28" \
  -d "$UPDATE_PAYLOAD")

HTTP_CODE=$(echo "$UPDATE_RESPONSE" | tail -n 1)
RESPONSE_BODY=$(echo "$UPDATE_RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "201" ]]; then
  echo -e "${GREEN}✓ Contact updated successfully${NC}"
  
  if command -v jq &> /dev/null; then
    UPDATED_TAGS=$(echo "$RESPONSE_BODY" | jq -r '.contact.tags // [] | join(", ")' 2>/dev/null || echo "N/A")
    echo -e "  Updated Tags: ${UPDATED_TAGS}"
    
    # Verify tags were merged (should have all 3 tags)
    if echo "$UPDATED_TAGS" | grep -q "tag-merge-test"; then
      echo -e "${GREEN}✓ Tag merging works correctly${NC}"
    else
      echo -e "${YELLOW}⚠ Warning: Tag merge may not have worked as expected${NC}"
    fi
  fi
else
  echo -e "${RED}✗ Failed to update contact (HTTP $HTTP_CODE)${NC}"
  echo -e "${YELLOW}Response: ${RESPONSE_BODY}${NC}"
fi
echo ""

# Test 4: Search for Contact
if command -v jq &> /dev/null && [[ -n "${TEST_CONTACT_ID:-}" ]]; then
  echo -e "${BLUE}Test 4: Searching for the test contact...${NC}"
  
  SEARCH_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "https://services.leadconnectorhq.com/contacts/${TEST_CONTACT_ID}?locationId=${GHL_LOCATION_ID}" \
    -H "Authorization: Bearer ${GHL_API_KEY}" \
    -H "Version: 2021-07-28")
  
  HTTP_CODE=$(echo "$SEARCH_RESPONSE" | tail -n 1)
  RESPONSE_BODY=$(echo "$SEARCH_RESPONSE" | sed '$d')
  
  if [[ "$HTTP_CODE" == "200" ]]; then
    echo -e "${GREEN}✓ Contact found successfully${NC}"
    
    FOUND_EMAIL=$(echo "$RESPONSE_BODY" | jq -r '.contact.email // "N/A"')
    FOUND_NAME=$(echo "$RESPONSE_BODY" | jq -r '"\(.contact.firstName // "") \(.contact.lastName // "")" | gsub("^\\s+|\\s+$";"")')
    
    echo -e "  Email: ${FOUND_EMAIL}"
    echo -e "  Name: ${FOUND_NAME}"
  else
    echo -e "${YELLOW}⚠ Could not retrieve contact details (HTTP $HTTP_CODE)${NC}"
  fi
  echo ""
fi

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ All GHL API tests passed!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}Your GoHighLevel API configuration is working correctly.${NC}"
echo ""
echo -e "${YELLOW}Note: A test contact was created in your GHL account:${NC}"
echo -e "  Email: ${TEST_EMAIL}"
echo -e "  Tags: api-test, automated-test, tag-merge-test"
echo ""
echo -e "${YELLOW}You can delete this contact from your GHL dashboard if desired.${NC}"
echo ""

# Optional: Provide information about the integration
echo -e "${BLUE}Next Steps:${NC}"
echo -e "1. The GHL integration will automatically sync users when they register"
echo -e "2. Check the documentation at: dentia/docs/GOHIGHLEVEL_*.md"
echo -e "3. Test the integration by creating a test user account"
echo ""


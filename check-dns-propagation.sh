#!/bin/bash

# DNS Propagation Checker for parlae.ca
# Checks every 5 minutes until AWS nameservers are detected

DOMAIN="parlae.ca"
EXPECTED_NS="ns-822.awsdns-38.net"

echo "🔍 Checking DNS propagation for $DOMAIN"
echo "Expected AWS nameserver: $EXPECTED_NS"
echo "Press Ctrl+C to stop monitoring"
echo "---"

check_count=0

while true; do
    check_count=$((check_count + 1))
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Get current nameservers
    current_ns=$(dig NS $DOMAIN +short | head -1)
    
    echo "[$timestamp] Check #$check_count"
    echo "  Current nameservers:"
    dig NS $DOMAIN +short | sed 's/^/    - /'
    
    # Check if AWS nameserver is present
    if dig NS $DOMAIN +short | grep -q "awsdns"; then
        echo ""
        echo "✅ SUCCESS! AWS nameservers detected!"
        echo "🎉 DNS propagation is complete!"
        echo ""
        echo "Next steps:"
        echo "  1. Run: cd /Users/shaunk/Projects/dentia/dentia-infra/infra/ecs"
        echo "  2. Run: terraform apply -var=\"stripe_publishable_key=pk_test_placeholder\" -var=\"stripe_secret_key=sk_test_placeholder\" -auto-approve"
        exit 0
    else
        echo "  ⏳ Still waiting for AWS nameservers..."
        echo "  Next check in 5 minutes..."
        echo ""
    fi
    
    sleep 300  # Wait 5 minutes
done



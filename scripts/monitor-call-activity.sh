#!/bin/bash
# Real-time monitoring of PMS activity during Vapi calls

echo "🔍 Monitoring PMS Activity (Press Ctrl+C to stop)"
echo "================================================"
echo ""
echo "📞 Make your test call now: +1 (415) 663-5316"
echo ""
echo "Watching:"
echo "  - PMS Audit Logs"
echo "  - Database Changes"
echo ""
echo "================================================"
echo ""

# Get baseline count
BASELINE=$(PGPASSWORD=parlae psql -h localhost -p 5433 -U parlae -d parlae -t -c "SELECT COUNT(*) FROM pms_audit_logs;" 2>/dev/null | tr -d ' ')

while true; do
  # Get current state
  CURRENT=$(PGPASSWORD=parlae psql -h localhost -p 5433 -U parlae -d parlae -t -c "SELECT COUNT(*) FROM pms_audit_logs;" 2>/dev/null | tr -d ' ')
  
  # Check for new activity
  if [ "$CURRENT" -gt "$BASELINE" ]; then
    echo ""
    echo "🎉 NEW ACTIVITY DETECTED!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Show last 3 activities
    PGPASSWORD=parlae psql -h localhost -p 5433 -U parlae -d parlae -c "
      SELECT 
        to_char(created_at, 'HH24:MI:SS') as time,
        action,
        success,
        response_status as status,
        response_time as \"time_ms\"
      FROM pms_audit_logs 
      ORDER BY created_at DESC 
      LIMIT 3;
    " 2>/dev/null
    
    echo ""
    echo "📋 Details of latest call:"
    PGPASSWORD=parlae psql -h localhost -p 5433 -U parlae -d parlae -c "
      SELECT 
        action,
        request_summary,
        success,
        error_message
      FROM pms_audit_logs 
      ORDER BY created_at DESC 
      LIMIT 1;
    " 2>/dev/null
    
    BASELINE=$CURRENT
    echo ""
    echo "Monitoring continues..."
    echo ""
  else
    echo -ne "\r⏳ Waiting for call activity... (Logs: $CURRENT)"
  fi
  
  sleep 2
done

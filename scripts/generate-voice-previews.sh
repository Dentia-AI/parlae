#!/bin/bash
# Generate OpenAI TTS voice previews for the voice selection page.
# Usage: OPENAI_API_KEY=sk-xxx ./scripts/generate-voice-previews.sh
#
# You can also use VAPI_PRIVATE_KEY if you don't have an OpenAI key directly:
#   VAPI_PRIVATE_KEY=xxx ./scripts/generate-voice-previews.sh --vapi

set -euo pipefail

OUTPUT_DIR="apps/frontend/apps/web/public/audio/voices"
mkdir -p "$OUTPUT_DIR"

SAMPLE_TEXT="Hello! Thank you for calling. I'm here to help you with scheduling, questions about our services, or anything else you may need. How can I assist you today?"

VOICES=("nova" "alloy" "shimmer" "echo" "fable" "onyx")

if [[ "${1:-}" == "--vapi" ]]; then
  if [ -z "${VAPI_PRIVATE_KEY:-}" ]; then
    echo "Error: VAPI_PRIVATE_KEY not set"
    exit 1
  fi
  echo "Generating previews via Vapi TTS endpoint..."
  for voice in "${VOICES[@]}"; do
    echo "  Generating ${voice}..."
    curl -s -X POST "https://api.vapi.ai/tts" \
      -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"voice\": {
          \"provider\": \"openai\",
          \"voiceId\": \"${voice}\"
        },
        \"text\": \"${SAMPLE_TEXT}\"
      }" \
      --output "$OUTPUT_DIR/${voice}-openai.mp3" || echo "    Warning: Failed for ${voice}"
  done
else
  if [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "Error: OPENAI_API_KEY not set. Pass --vapi to use VAPI_PRIVATE_KEY instead."
    exit 1
  fi
  echo "Generating previews via OpenAI TTS API..."
  for voice in "${VOICES[@]}"; do
    echo "  Generating ${voice}..."
    curl -s -X POST "https://api.openai.com/v1/audio/speech" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"model\": \"tts-1\",
        \"input\": \"${SAMPLE_TEXT}\",
        \"voice\": \"${voice}\",
        \"response_format\": \"mp3\"
      }" \
      --output "$OUTPUT_DIR/${voice}-openai.mp3" || echo "    Warning: Failed for ${voice}"
  done
fi

echo ""
echo "Done! Files generated in $OUTPUT_DIR:"
ls -la "$OUTPUT_DIR"

#!/usr/bin/env bash
#
# check-template-version.sh
#
# Verifies that the Vapi template version was bumped when template
# content files were modified. Designed to run in CI or locally.
#
# Usage:
#   ./scripts/check-template-version.sh [base-ref]
#
# base-ref defaults to origin/main
#

set -euo pipefail

BASE_REF="${1:-origin/main}"

TEMPLATE_FILES=(
  "apps/frontend/packages/shared/src/vapi/templates/dental-clinic.template.ts"
  "apps/frontend/packages/shared/src/vapi/vapi-pms-tools.config.ts"
)

VERSION_FILE="apps/frontend/packages/shared/src/vapi/templates/dental-clinic.template.ts"
VERSION_PATTERN="DENTAL_CLINIC_TEMPLATE_VERSION"

echo "Checking template version bump against ${BASE_REF}..."

# Check if any template files were changed
changed_templates=()
for f in "${TEMPLATE_FILES[@]}"; do
  if git diff --name-only "${BASE_REF}" -- "$f" | grep -q .; then
    changed_templates+=("$f")
  fi
done

if [ ${#changed_templates[@]} -eq 0 ]; then
  echo "No template files changed. Nothing to check."
  exit 0
fi

echo "Changed template files:"
for f in "${changed_templates[@]}"; do
  echo "  - $f"
done

# Check if the version constant changed
if git diff "${BASE_REF}" -- "${VERSION_FILE}" | grep -q "^[+-].*${VERSION_PATTERN}"; then
  echo ""
  echo "Template version was bumped. All good."
  exit 0
else
  echo ""
  echo "ERROR: Template files were changed but DENTAL_CLINIC_TEMPLATE_VERSION was NOT bumped!"
  echo ""
  echo "The deploy route uses the version to decide whether to use the new prompts or"
  echo "the stale DB-stored prompts. Without a version bump, your changes will be ignored."
  echo ""
  echo "Fix: In ${VERSION_FILE}, update:"
  echo "  export const DENTAL_CLINIC_TEMPLATE_VERSION = 'vX.Y';  // bump this"
  echo "  export const DENTAL_CLINIC_TEMPLATE_DISPLAY_NAME = 'Dental Clinic Squad vX.Y';"
  echo ""
  exit 1
fi

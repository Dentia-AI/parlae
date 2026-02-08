#!/usr/bin/env bash
#
# Starter Kit Setup Script
# One-command deployment of entire stack
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

print_header() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
}

# Check if config exists
if [[ ! -f "${SCRIPT_DIR}/config.sh" ]]; then
  log_error "config.sh not found!"
  echo ""
  echo "Please create config.sh from config.example.sh:"
  echo "  cp config.example.sh config.sh"
  echo "  nano config.sh  # Fill in your values"
  echo ""
  exit 1
fi

# Load configuration
source "${SCRIPT_DIR}/config.sh"

# Validate configuration
if ! validate_config; then
  exit 1
fi

print_header "Starter Kit Setup"
log_info "Project: ${PROJECT_NAME}"
log_info "Region: ${AWS_REGION}"
log_info "App Domain: ${APP_DOMAIN}"
log_info "Hub Domain: ${HUB_DOMAIN}"
echo ""

# Check prerequisites
print_header "Checking Prerequisites"

check_command() {
  if command -v "$1" &> /dev/null; then
    log_success "$1 installed"
    return 0
  else
    log_error "$1 not found!"
    return 1
  fi
}

PREREQ_FAILED=0
check_command "aws" || PREREQ_FAILED=1
check_command "terraform" || PREREQ_FAILED=1
check_command "docker" || PREREQ_FAILED=1
check_command "node" || PREREQ_FAILED=1
check_command "pnpm" || PREREQ_FAILED=1

if [[ $PREREQ_FAILED -eq 1 ]]; then
  log_error "Missing prerequisites. Please install missing tools."
  exit 1
fi

# Check AWS credentials
log_info "Checking AWS credentials..."
if aws sts get-caller-identity --profile "${AWS_PROFILE}" &>/dev/null; then
  ACCOUNT_ID=$(aws sts get-caller-identity --profile "${AWS_PROFILE}" --query Account --output text)
  log_success "AWS credentials valid (Account: ${ACCOUNT_ID})"
else
  log_error "AWS credentials not configured for profile: ${AWS_PROFILE}"
  echo ""
  echo "Configure AWS CLI:"
  echo "  aws configure --profile ${AWS_PROFILE}"
  exit 1
fi

# Menu
echo ""
echo "What would you like to do?"
echo ""
echo "  [1] Full Setup (First Time) - Sets up everything from scratch"
echo "  [2] Deploy Infrastructure Only - Just Terraform"
echo "  [3] Deploy Applications Only - Just Docker images"
echo "  [4] Deploy Everything - Infrastructure + Applications"
echo "  [5] Deploy Main App (parlae) Only"
echo "  [6] Deploy Forum (parlaehub) Only"
echo "  [7] Generate Secrets - Create random passwords/keys"
echo "  [8] Validate Configuration - Check your config.sh"
echo "  [9] Exit"
echo ""
read -p "Choose an option [1-9]: " choice

case $choice in
  1)
    log_info "Starting full setup..."
    exec "${SCRIPT_DIR}/scripts/full-setup.sh"
    ;;
  2)
    log_info "Deploying infrastructure..."
    exec "${SCRIPT_DIR}/scripts/deploy-infrastructure.sh"
    ;;
  3)
    log_info "Deploying applications..."
    exec "${SCRIPT_DIR}/scripts/deploy-applications.sh"
    ;;
  4)
    log_info "Deploying everything..."
    "${SCRIPT_DIR}/scripts/deploy-infrastructure.sh"
    "${SCRIPT_DIR}/scripts/deploy-applications.sh"
    ;;
  5)
    log_info "Deploying main app..."
    exec "${SCRIPT_DIR}/scripts/deploy-parlae.sh"
    ;;
  6)
    log_info "Deploying forum..."
    exec "${SCRIPT_DIR}/scripts/deploy-parlaehub.sh"
    ;;
  7)
    exec "${SCRIPT_DIR}/scripts/generate-secrets.sh"
    ;;
  8)
    log_success "Configuration is valid!"
    ;;
  9)
    log_info "Exiting..."
    exit 0
    ;;
  *)
    log_error "Invalid option"
    exit 1
    ;;
esac


#!/usr/bin/env bash

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: GitHub CLI (gh) is required: https://cli.github.com/" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl is required." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

repo="${1:-}"
if [[ -z "$repo" ]]; then
  repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null || true)"
fi

if [[ -z "$repo" ]]; then
  echo "Error: could not determine the GitHub repository." >&2
  echo "Run this script inside the repository or pass OWNER/REPO as its first argument." >&2
  exit 1
fi

read -r -p "Developer ID Application .p12 path: " p12_path
if [[ "$p12_path" == "~/"* ]]; then
  p12_path="$HOME/${p12_path:2}"
fi
if [[ ! -f "$p12_path" ]]; then
  echo "Error: file not found: $p12_path" >&2
  exit 1
fi

read -r -s -p ".p12 export password: " mac_csc_key_password
echo
read -r -p "Apple ID email: " apple_id
read -r -s -p "Apple app-specific password: " apple_app_specific_password
echo
read -r -p "Apple Developer Team ID: " apple_team_id

if [[ -z "$mac_csc_key_password" || -z "$apple_id" || -z "$apple_app_specific_password" || -z "$apple_team_id" ]]; then
  echo "Error: secret values must not be empty." >&2
  exit 1
fi

if [[ ! "$apple_team_id" =~ ^[A-Za-z0-9]{10}$ ]]; then
  echo "Error: Apple Developer Team ID must contain exactly 10 letters or digits." >&2
  exit 1
fi

echo "Writing macOS signing secrets to $repo ..."
openssl base64 -A -in "$p12_path" | gh secret set MAC_CSC_LINK --repo "$repo"
printf '%s' "$mac_csc_key_password" | gh secret set MAC_CSC_KEY_PASSWORD --repo "$repo"
printf '%s' "$apple_id" | gh secret set APPLE_ID --repo "$repo"
printf '%s' "$apple_app_specific_password" | gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo "$repo"
printf '%s' "$apple_team_id" | gh secret set APPLE_TEAM_ID --repo "$repo"

unset mac_csc_key_password apple_app_specific_password

echo "Done. Configured:"
gh secret list --repo "$repo" | awk '$1 ~ /^(MAC_CSC_LINK|MAC_CSC_KEY_PASSWORD|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID)$/ { print "- " $1 }'

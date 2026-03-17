#!/bin/bash
# Template: Form Automation Workflow
# Purpose: Fill and submit web forms with validation
# Usage: ./form-automation.sh <form-url>
#
# This template demonstrates the snapshot-interact-verify pattern:
# 1. Navigate to form
# 2. Snapshot to get element refs
# 3. Fill fields using refs
# 4. Submit and verify result
#
# Customize: Update the refs (@e1, @e2, etc.) based on your form's snapshot output

set -euo pipefail

FORM_URL="${1:?Usage: $0 <form-url>}"

echo "Form automation: $FORM_URL"

# Step 1: Navigate to form
banana-browser open "$FORM_URL"
banana-browser wait --load networkidle

# Step 2: Snapshot to discover form elements
echo ""
echo "Form structure:"
banana-browser snapshot -i

# Step 3: Fill form fields (customize these refs based on snapshot output)
#
# Common field types:
#   banana-browser fill @e1 "John Doe"           # Text input
#   banana-browser fill @e2 "user@example.com"   # Email input
#   banana-browser fill @e3 "SecureP@ss123"      # Password input
#   banana-browser select @e4 "Option Value"     # Dropdown
#   banana-browser check @e5                     # Checkbox
#   banana-browser click @e6                     # Radio button
#   banana-browser fill @e7 "Multi-line text"   # Textarea
#   banana-browser upload @e8 /path/to/file.pdf # File upload
#
# Uncomment and modify:
# banana-browser fill @e1 "Test User"
# banana-browser fill @e2 "test@example.com"
# banana-browser click @e3  # Submit button

# Step 4: Wait for submission
# banana-browser wait --load networkidle
# banana-browser wait --url "**/success"  # Or wait for redirect

# Step 5: Verify result
echo ""
echo "Result:"
banana-browser get url
banana-browser snapshot -i

# Optional: Capture evidence
banana-browser screenshot /tmp/form-result.png
echo "Screenshot saved: /tmp/form-result.png"

# Cleanup
banana-browser close
echo "Done"

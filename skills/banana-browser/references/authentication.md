# Authentication Patterns

Login flows, session persistence, OAuth, 2FA, and authenticated browsing.

**Related**: [session-management.md](session-management.md) for state persistence details, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Import Auth from Your Browser](#import-auth-from-your-browser)
- [Persistent Profiles](#persistent-profiles)
- [Session Persistence](#session-persistence)
- [Basic Login Flow](#basic-login-flow)
- [Saving Authentication State](#saving-authentication-state)
- [Restoring Authentication](#restoring-authentication)
- [OAuth / SSO Flows](#oauth--sso-flows)
- [Two-Factor Authentication](#two-factor-authentication)
- [HTTP Basic Auth](#http-basic-auth)
- [Cookie-Based Auth](#cookie-based-auth)
- [Token Refresh Handling](#token-refresh-handling)
- [Security Best Practices](#security-best-practices)

## Import Auth from Your Browser

The fastest way to authenticate is to reuse cookies from a Chrome session you are already logged into.

**Step 1: Start Chrome with remote debugging**

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Log in to your target site(s) in this Chrome window as you normally would.

> **Security note:** `--remote-debugging-port` exposes full browser control on localhost. Any local process can connect and read cookies, execute JS, etc. Only use on trusted machines and close Chrome when done.

**Step 2: Grab the auth state**

```bash
# Auto-discover the running Chrome and save its cookies + localStorage
banana-browser --auto-connect state save ./my-auth.json
```

**Step 3: Reuse in automation**

```bash
# Load auth at launch
banana-browser --state ./my-auth.json open https://app.example.com/dashboard

# Or load into an existing session
banana-browser state load ./my-auth.json
banana-browser open https://app.example.com/dashboard
```

This works for any site, including those with complex OAuth flows, SSO, or 2FA -- as long as Chrome already has valid session cookies.

> **Security note:** State files contain session tokens in plaintext. Add them to `.gitignore`, delete when no longer needed, and set `AGENT_BROWSER_ENCRYPTION_KEY` for encryption at rest. See [Security Best Practices](#security-best-practices).

**Tip:** Combine with `--session-name` so the imported auth auto-persists across restarts:

```bash
banana-browser --session-name myapp state load ./my-auth.json
# From now on, state is auto-saved/restored for "myapp"
```

## Persistent Profiles

Use `--profile` to point banana-browser at a Chrome user data directory. This persists everything (cookies, IndexedDB, service workers, cache) across browser restarts without explicit save/load:

```bash
# First run: login once
banana-browser --profile ~/.myapp-profile open https://app.example.com/login
# ... complete login flow ...

# All subsequent runs: already authenticated
banana-browser --profile ~/.myapp-profile open https://app.example.com/dashboard
```

Use different paths for different projects or test users:

```bash
banana-browser --profile ~/.profiles/admin open https://app.example.com
banana-browser --profile ~/.profiles/viewer open https://app.example.com
```

Or set via environment variable:

```bash
export AGENT_BROWSER_PROFILE=~/.myapp-profile
banana-browser open https://app.example.com/dashboard
```

## Session Persistence

Use `--session-name` to auto-save and restore cookies + localStorage by name, without managing files:

```bash
# Auto-saves state on close, auto-restores on next launch
banana-browser --session-name twitter open https://twitter.com
# ... login flow ...
banana-browser close  # state saved to ~/.banana-browser/sessions/

# Next time: state is automatically restored
banana-browser --session-name twitter open https://twitter.com
```

Encrypt state at rest:

```bash
export AGENT_BROWSER_ENCRYPTION_KEY=$(openssl rand -hex 32)
banana-browser --session-name secure open https://app.example.com
```

## Basic Login Flow

```bash
# Navigate to login page
banana-browser open https://app.example.com/login
banana-browser wait --load networkidle

# Get form elements
banana-browser snapshot -i
# Output: @e1 [input type="email"], @e2 [input type="password"], @e3 [button] "Sign In"

# Fill credentials
banana-browser fill @e1 "user@example.com"
banana-browser fill @e2 "password123"

# Submit
banana-browser click @e3
banana-browser wait --load networkidle

# Verify login succeeded
banana-browser get url  # Should be dashboard, not login
```

## Saving Authentication State

After logging in, save state for reuse:

```bash
# Login first (see above)
banana-browser open https://app.example.com/login
banana-browser snapshot -i
banana-browser fill @e1 "user@example.com"
banana-browser fill @e2 "password123"
banana-browser click @e3
banana-browser wait --url "**/dashboard"

# Save authenticated state
banana-browser state save ./auth-state.json
```

## Restoring Authentication

Skip login by loading saved state:

```bash
# Load saved auth state
banana-browser state load ./auth-state.json

# Navigate directly to protected page
banana-browser open https://app.example.com/dashboard

# Verify authenticated
banana-browser snapshot -i
```

## OAuth / SSO Flows

For OAuth redirects:

```bash
# Start OAuth flow
banana-browser open https://app.example.com/auth/google

# Handle redirects automatically
banana-browser wait --url "**/accounts.google.com**"
banana-browser snapshot -i

# Fill Google credentials
banana-browser fill @e1 "user@gmail.com"
banana-browser click @e2  # Next button
banana-browser wait 2000
banana-browser snapshot -i
banana-browser fill @e3 "password"
banana-browser click @e4  # Sign in

# Wait for redirect back
banana-browser wait --url "**/app.example.com**"
banana-browser state save ./oauth-state.json
```

## Two-Factor Authentication

Handle 2FA with manual intervention:

```bash
# Login with credentials
banana-browser open https://app.example.com/login --headed  # Show browser
banana-browser snapshot -i
banana-browser fill @e1 "user@example.com"
banana-browser fill @e2 "password123"
banana-browser click @e3

# Wait for user to complete 2FA manually
echo "Complete 2FA in the browser window..."
banana-browser wait --url "**/dashboard" --timeout 120000

# Save state after 2FA
banana-browser state save ./2fa-state.json
```

## HTTP Basic Auth

For sites using HTTP Basic Authentication:

```bash
# Set credentials before navigation
banana-browser set credentials username password

# Navigate to protected resource
banana-browser open https://protected.example.com/api
```

## Cookie-Based Auth

Manually set authentication cookies:

```bash
# Set auth cookie
banana-browser cookies set session_token "abc123xyz"

# Navigate to protected page
banana-browser open https://app.example.com/dashboard
```

## Token Refresh Handling

For sessions with expiring tokens:

```bash
#!/bin/bash
# Wrapper that handles token refresh

STATE_FILE="./auth-state.json"

# Try loading existing state
if [[ -f "$STATE_FILE" ]]; then
    banana-browser state load "$STATE_FILE"
    banana-browser open https://app.example.com/dashboard

    # Check if session is still valid
    URL=$(banana-browser get url)
    if [[ "$URL" == *"/login"* ]]; then
        echo "Session expired, re-authenticating..."
        # Perform fresh login
        banana-browser snapshot -i
        banana-browser fill @e1 "$USERNAME"
        banana-browser fill @e2 "$PASSWORD"
        banana-browser click @e3
        banana-browser wait --url "**/dashboard"
        banana-browser state save "$STATE_FILE"
    fi
else
    # First-time login
    banana-browser open https://app.example.com/login
    # ... login flow ...
fi
```

## Security Best Practices

1. **Never commit state files** - They contain session tokens
   ```bash
   echo "*.auth-state.json" >> .gitignore
   ```

2. **Use environment variables for credentials**
   ```bash
   banana-browser fill @e1 "$APP_USERNAME"
   banana-browser fill @e2 "$APP_PASSWORD"
   ```

3. **Clean up after automation**
   ```bash
   banana-browser cookies clear
   rm -f ./auth-state.json
   ```

4. **Use short-lived sessions for CI/CD**
   ```bash
   # Don't persist state in CI
   banana-browser open https://app.example.com/login
   # ... login and perform actions ...
   banana-browser close  # Session ends, nothing persisted
   ```

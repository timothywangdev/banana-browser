# Command Reference

Complete reference for all banana-browser commands. For quick start and common patterns, see SKILL.md.

## Navigation

```bash
banana-browser open <url>      # Navigate to URL (aliases: goto, navigate)
                              # Supports: https://, http://, file://, about:, data://
                              # Auto-prepends https:// if no protocol given
banana-browser back            # Go back
banana-browser forward         # Go forward
banana-browser reload          # Reload page
banana-browser close           # Close browser (aliases: quit, exit)
banana-browser connect 9222    # Connect to browser via CDP port
```

## Snapshot (page analysis)

```bash
banana-browser snapshot            # Full accessibility tree
banana-browser snapshot -i         # Interactive elements only (recommended)
banana-browser snapshot -c         # Compact output
banana-browser snapshot -d 3       # Limit depth to 3
banana-browser snapshot -s "#main" # Scope to CSS selector
```

## Interactions (use @refs from snapshot)

```bash
banana-browser click @e1           # Click
banana-browser click @e1 --new-tab # Click and open in new tab
banana-browser dblclick @e1        # Double-click
banana-browser focus @e1           # Focus element
banana-browser fill @e2 "text"     # Clear and type
banana-browser type @e2 "text"     # Type without clearing
banana-browser press Enter         # Press key (alias: key)
banana-browser press Control+a     # Key combination
banana-browser keydown Shift       # Hold key down
banana-browser keyup Shift         # Release key
banana-browser hover @e1           # Hover
banana-browser check @e1           # Check checkbox
banana-browser uncheck @e1         # Uncheck checkbox
banana-browser select @e1 "value"  # Select dropdown option
banana-browser select @e1 "a" "b"  # Select multiple options
banana-browser scroll down 500     # Scroll page (default: down 300px)
banana-browser scrollintoview @e1  # Scroll element into view (alias: scrollinto)
banana-browser drag @e1 @e2        # Drag and drop
banana-browser upload @e1 file.pdf # Upload files
```

## Get Information

```bash
banana-browser get text @e1        # Get element text
banana-browser get html @e1        # Get innerHTML
banana-browser get value @e1       # Get input value
banana-browser get attr @e1 href   # Get attribute
banana-browser get title           # Get page title
banana-browser get url             # Get current URL
banana-browser get cdp-url         # Get CDP WebSocket URL
banana-browser get count ".item"   # Count matching elements
banana-browser get box @e1         # Get bounding box
banana-browser get styles @e1      # Get computed styles (font, color, bg, etc.)
```

## Check State

```bash
banana-browser is visible @e1      # Check if visible
banana-browser is enabled @e1      # Check if enabled
banana-browser is checked @e1      # Check if checked
```

## Screenshots and PDF

```bash
banana-browser screenshot          # Save to temporary directory
banana-browser screenshot path.png # Save to specific path
banana-browser screenshot --full   # Full page
banana-browser pdf output.pdf      # Save as PDF
```

## Video Recording

```bash
banana-browser record start ./demo.webm    # Start recording
banana-browser click @e1                   # Perform actions
banana-browser record stop                 # Stop and save video
banana-browser record restart ./take2.webm # Stop current + start new
```

## Wait

```bash
banana-browser wait @e1                     # Wait for element
banana-browser wait 2000                    # Wait milliseconds
banana-browser wait --text "Success"        # Wait for text (or -t)
banana-browser wait --url "**/dashboard"    # Wait for URL pattern (or -u)
banana-browser wait --load networkidle      # Wait for network idle (or -l)
banana-browser wait --fn "window.ready"     # Wait for JS condition (or -f)
```

## Mouse Control

```bash
banana-browser mouse move 100 200      # Move mouse
banana-browser mouse down left         # Press button
banana-browser mouse up left           # Release button
banana-browser mouse wheel 100         # Scroll wheel
```

## Semantic Locators (alternative to refs)

```bash
banana-browser find role button click --name "Submit"
banana-browser find text "Sign In" click
banana-browser find text "Sign In" click --exact      # Exact match only
banana-browser find label "Email" fill "user@test.com"
banana-browser find placeholder "Search" type "query"
banana-browser find alt "Logo" click
banana-browser find title "Close" click
banana-browser find testid "submit-btn" click
banana-browser find first ".item" click
banana-browser find last ".item" click
banana-browser find nth 2 "a" hover
```

## Browser Settings

```bash
banana-browser set viewport 1920 1080          # Set viewport size
banana-browser set viewport 1920 1080 2        # 2x retina (same CSS size, higher res screenshots)
banana-browser set device "iPhone 14"          # Emulate device
banana-browser set geo 37.7749 -122.4194       # Set geolocation (alias: geolocation)
banana-browser set offline on                  # Toggle offline mode
banana-browser set headers '{"X-Key":"v"}'     # Extra HTTP headers
banana-browser set credentials user pass       # HTTP basic auth (alias: auth)
banana-browser set media dark                  # Emulate color scheme
banana-browser set media light reduced-motion  # Light mode + reduced motion
```

## Cookies and Storage

```bash
banana-browser cookies                     # Get all cookies
banana-browser cookies set name value      # Set cookie
banana-browser cookies clear               # Clear cookies
banana-browser storage local               # Get all localStorage
banana-browser storage local key           # Get specific key
banana-browser storage local set k v       # Set value
banana-browser storage local clear         # Clear all
```

## Network

```bash
banana-browser network route <url>              # Intercept requests
banana-browser network route <url> --abort      # Block requests
banana-browser network route <url> --body '{}'  # Mock response
banana-browser network unroute [url]            # Remove routes
banana-browser network requests                 # View tracked requests
banana-browser network requests --filter api    # Filter requests
```

## Tabs and Windows

```bash
banana-browser tab                 # List tabs
banana-browser tab new [url]       # New tab
banana-browser tab 2               # Switch to tab by index
banana-browser tab close           # Close current tab
banana-browser tab close 2         # Close tab by index
banana-browser window new          # New window
```

## Frames

```bash
banana-browser frame "#iframe"     # Switch to iframe
banana-browser frame main          # Back to main frame
```

## Dialogs

```bash
banana-browser dialog accept [text]  # Accept dialog
banana-browser dialog dismiss        # Dismiss dialog
```

## JavaScript

```bash
banana-browser eval "document.title"          # Simple expressions only
banana-browser eval -b "<base64>"             # Any JavaScript (base64 encoded)
banana-browser eval --stdin                   # Read script from stdin
```

Use `-b`/`--base64` or `--stdin` for reliable execution. Shell escaping with nested quotes and special characters is error-prone.

```bash
# Base64 encode your script, then:
banana-browser eval -b "ZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3NyYyo9Il9uZXh0Il0nKQ=="

# Or use stdin with heredoc for multiline scripts:
cat <<'EOF' | banana-browser eval --stdin
const links = document.querySelectorAll('a');
Array.from(links).map(a => a.href);
EOF
```

## State Management

```bash
banana-browser state save auth.json    # Save cookies, storage, auth state
banana-browser state load auth.json    # Restore saved state
```

## Global Options

```bash
banana-browser --session <name> ...    # Isolated browser session
banana-browser --json ...              # JSON output for parsing
banana-browser --headed ...            # Show browser window (not headless)
banana-browser --full ...              # Full page screenshot (-f)
banana-browser --cdp <port> ...        # Connect via Chrome DevTools Protocol
banana-browser -p <provider> ...       # Cloud browser provider (--provider)
banana-browser --proxy <url> ...       # Use proxy server
banana-browser --proxy-bypass <hosts>  # Hosts to bypass proxy
banana-browser --headers <json> ...    # HTTP headers scoped to URL's origin
banana-browser --executable-path <p>   # Custom browser executable
banana-browser --extension <path> ...  # Load browser extension (repeatable)
banana-browser --ignore-https-errors   # Ignore SSL certificate errors
banana-browser --help                  # Show help (-h)
banana-browser --version               # Show version (-V)
banana-browser <command> --help        # Show detailed help for a command
```

## Debugging

```bash
banana-browser --headed open example.com   # Show browser window
banana-browser --cdp 9222 snapshot         # Connect via CDP port
banana-browser connect 9222                # Alternative: connect command
banana-browser console                     # View console messages
banana-browser console --clear             # Clear console
banana-browser errors                      # View page errors
banana-browser errors --clear              # Clear errors
banana-browser highlight @e1               # Highlight element
banana-browser inspect                     # Open Chrome DevTools for this session
banana-browser trace start                 # Start recording trace
banana-browser trace stop trace.zip        # Stop and save trace
banana-browser profiler start              # Start Chrome DevTools profiling
banana-browser profiler stop trace.json    # Stop and save profile
```

## Environment Variables

```bash
AGENT_BROWSER_SESSION="mysession"            # Default session name
AGENT_BROWSER_EXECUTABLE_PATH="/path/chrome" # Custom browser path
AGENT_BROWSER_EXTENSIONS="/ext1,/ext2"       # Comma-separated extension paths
AGENT_BROWSER_PROVIDER="browserbase"         # Cloud browser provider
AGENT_BROWSER_STREAM_PORT="9223"             # WebSocket streaming port
AGENT_BROWSER_HOME="/path/to/banana-browser"  # Custom install location
```

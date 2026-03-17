---
name: slack
description: Interact with Slack workspaces using browser automation. Use when the user needs to check unread channels, navigate Slack, send messages, extract data, find information, search conversations, or automate any Slack task. Triggers include "check my Slack", "what channels have unreads", "send a message to", "search Slack for", "extract from Slack", "find who said", or any task requiring programmatic Slack interaction.
allowed-tools: Bash(banana-browser:*), Bash(npx banana-browser:*)
---

# Slack Automation

Interact with Slack workspaces to check messages, extract data, and automate common tasks.

## Quick Start

Connect to an existing Slack browser session or open Slack:

```bash
# Connect to existing session on port 9222 (typical for already-open Slack)
banana-browser connect 9222

# Or open Slack if not already running
banana-browser open https://app.slack.com
```

Then take a snapshot to see what's available:

```bash
banana-browser snapshot -i
```

## Core Workflow

1. **Connect/Navigate**: Open or connect to Slack
2. **Snapshot**: Get interactive elements with refs (`@e1`, `@e2`, etc.)
3. **Navigate**: Click tabs, expand sections, or navigate to specific channels
4. **Extract/Interact**: Read data or perform actions
5. **Screenshot**: Capture evidence of findings

```bash
# Example: Check unread channels
banana-browser connect 9222
banana-browser snapshot -i
# Look for "More unreads" button
banana-browser click @e21  # Ref for "More unreads" button
banana-browser screenshot slack-unreads.png
```

## Common Tasks

### Checking Unread Messages

```bash
# Connect to Slack
banana-browser connect 9222

# Take snapshot to locate unreads button
banana-browser snapshot -i

# Look for:
# - "More unreads" button (usually near top of sidebar)
# - "Unreads" toggle in Activity tab (shows unread count)
# - Channel names with badges/bold text indicating unreads

# Navigate to Activity tab to see all unreads in one view
banana-browser click @e14  # Activity tab (ref may vary)
banana-browser wait 1000
banana-browser screenshot activity-unreads.png

# Or check DMs tab
banana-browser click @e13  # DMs tab
banana-browser screenshot dms.png

# Or expand "More unreads" in sidebar
banana-browser click @e21  # More unreads button
banana-browser wait 500
banana-browser screenshot expanded-unreads.png
```

### Navigating to a Channel

```bash
# Search for channel in sidebar or by name
banana-browser snapshot -i

# Look for channel name in the list (e.g., "engineering", "product-design")
# Click on the channel treeitem ref
banana-browser click @e94  # Example: engineering channel ref
banana-browser wait --load networkidle
banana-browser screenshot channel.png
```

### Finding Messages/Threads

```bash
# Use Slack search
banana-browser snapshot -i
banana-browser click @e5  # Search button (typical ref)
banana-browser fill @e_search "keyword"
banana-browser press Enter
banana-browser wait --load networkidle
banana-browser screenshot search-results.png
```

### Extracting Channel Information

```bash
# Get list of all visible channels
banana-browser snapshot --json > slack-snapshot.json

# Parse for channel names and metadata
# Look for treeitem elements with level=2 (sub-channels under sections)
```

### Checking Channel Details

```bash
# Open a channel
banana-browser click @e_channel_ref
banana-browser wait 1000

# Get channel info (members, description, etc.)
banana-browser snapshot -i
banana-browser screenshot channel-details.png

# Scroll through messages
banana-browser scroll down 500
banana-browser screenshot channel-messages.png
```

### Taking Notes/Capturing State

When you need to document findings from Slack:

```bash
# Take annotated screenshot (shows element numbers)
banana-browser screenshot --annotate slack-state.png

# Take full-page screenshot
banana-browser screenshot --full slack-full.png

# Get current URL for reference
banana-browser get url

# Get page title
banana-browser get title
```

## Sidebar Structure

Understanding Slack's sidebar helps you navigate efficiently:

```
- Threads
- Huddles
- Drafts & sent
- Directories
- [Section Headers - External connections, Starred, Channels, etc.]
  - [Channels listed as treeitems]
- Direct Messages
  - [DMs listed]
- Apps
  - [App shortcuts]
- [More unreads] button (toggles unread channels list)
```

Key refs to look for:
- `@e12` - Home tab (usually)
- `@e13` - DMs tab
- `@e14` - Activity tab
- `@e5` - Search button
- `@e21` - More unreads button (varies by session)

## Tabs in Slack

After clicking on a channel, you'll see tabs:
- **Messages** - Channel conversation
- **Files** - Shared files
- **Pins** - Pinned messages
- **Add canvas** - Collaborative canvas
- Other tabs depending on workspace setup

Click tab refs to switch views and get different information.

## Extracting Data from Slack

### Get Text Content

```bash
# Get a message or element's text
banana-browser get text @e_message_ref
```

### Parse Accessibility Tree

```bash
# Full snapshot as JSON for programmatic parsing
banana-browser snapshot --json > output.json

# Look for:
# - Channel names (name field in treeitem)
# - Message content (in listitem/document elements)
# - User names (button elements with user info)
# - Timestamps (link elements with time info)
```

### Count Unreads

```bash
# After expanding unreads section:
banana-browser snapshot -i | grep -c "treeitem"
# Each treeitem with a channel name in the unreads section is one unread
```

## Best Practices

- **Connect to existing sessions**: Use `banana-browser connect 9222` if Slack is already open. This is faster than opening a new browser.
- **Take snapshots before clicking**: Always `snapshot -i` to identify refs before clicking buttons.
- **Re-snapshot after navigation**: After navigating to a new channel or section, take a fresh snapshot to find new refs.
- **Use JSON snapshots for parsing**: When you need to extract structured data, use `snapshot --json` for machine-readable output.
- **Pace interactions**: Add `sleep 1` between rapid interactions to let the UI update.
- **Check accessibility tree**: The accessibility tree shows what screen readers (and your automation) can see. If an element isn't in the snapshot, it may be hidden or require scrolling.
- **Scroll in sidebar**: Use `banana-browser scroll down 300 --selector ".p-sidebar"` to scroll within the Slack sidebar if channel list is long.

## Limitations

- **Cannot access Slack API**: This uses browser automation, not the Slack API. No OAuth, webhooks, or bot tokens needed.
- **Session-specific**: Screenshots and snapshots are tied to the current browser session.
- **Rate limiting**: Slack may rate-limit rapid interactions. Add delays between commands if needed.
- **Workspace-specific**: You interact with your own workspace -- no cross-workspace automation.

## Debugging

### Check console for errors

```bash
banana-browser console
banana-browser errors
```

### View raw HTML of an element

```bash
# Snapshot shows the accessibility tree. If an element isn't there,
# it may not be interactive (e.g., div instead of button)
# Use snapshot -i -C to include cursor-interactive divs
banana-browser snapshot -i -C
```

### Get current page state

```bash
banana-browser get url
banana-browser get title
banana-browser screenshot page-state.png
```

## Example: Full Unread Check

```bash
#!/bin/bash

# Connect to Slack
banana-browser connect 9222

# Take initial snapshot
echo "=== Checking Slack unreads ==="
banana-browser snapshot -i > snapshot.txt

# Check Activity tab for unreads
banana-browser click @e14  # Activity tab
banana-browser wait 1000
banana-browser screenshot activity.png
ACTIVITY_RESULT=$(banana-browser get text @e_main_area)
echo "Activity: $ACTIVITY_RESULT"

# Check DMs
banana-browser click @e13  # DMs tab
banana-browser wait 1000
banana-browser screenshot dms.png

# Check unread channels in sidebar
banana-browser click @e21  # More unreads button
banana-browser wait 500
banana-browser snapshot -i > unreads-expanded.txt
banana-browser screenshot unreads.png

# Summary
echo "=== Summary ==="
echo "See activity.png, dms.png, and unreads.png for full details"
```

## References

- **Slack docs**: https://slack.com/help
- **Web experience**: https://app.slack.com
- **Keyboard shortcuts**: Type `?` in Slack for shortcut list

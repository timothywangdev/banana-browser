# Snapshot and Refs

Compact element references that reduce context usage dramatically for AI agents.

**Related**: [commands.md](commands.md) for full command reference, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [How Refs Work](#how-refs-work)
- [Snapshot Command](#the-snapshot-command)
- [Using Refs](#using-refs)
- [Ref Lifecycle](#ref-lifecycle)
- [Best Practices](#best-practices)
- [Ref Notation Details](#ref-notation-details)
- [Troubleshooting](#troubleshooting)

## How Refs Work

Traditional approach:
```
Full DOM/HTML → AI parses → CSS selector → Action (~3000-5000 tokens)
```

banana-browser approach:
```
Compact snapshot → @refs assigned → Direct interaction (~200-400 tokens)
```

## The Snapshot Command

```bash
# Basic snapshot (shows page structure)
banana-browser snapshot

# Interactive snapshot (-i flag) - RECOMMENDED
banana-browser snapshot -i
```

### Snapshot Output Format

```
Page: Example Site - Home
URL: https://example.com

@e1 [header]
  @e2 [nav]
    @e3 [a] "Home"
    @e4 [a] "Products"
    @e5 [a] "About"
  @e6 [button] "Sign In"

@e7 [main]
  @e8 [h1] "Welcome"
  @e9 [form]
    @e10 [input type="email"] placeholder="Email"
    @e11 [input type="password"] placeholder="Password"
    @e12 [button type="submit"] "Log In"

@e13 [footer]
  @e14 [a] "Privacy Policy"
```

## Using Refs

Once you have refs, interact directly:

```bash
# Click the "Sign In" button
banana-browser click @e6

# Fill email input
banana-browser fill @e10 "user@example.com"

# Fill password
banana-browser fill @e11 "password123"

# Submit the form
banana-browser click @e12
```

## Ref Lifecycle

**IMPORTANT**: Refs are invalidated when the page changes!

```bash
# Get initial snapshot
banana-browser snapshot -i
# @e1 [button] "Next"

# Click triggers page change
banana-browser click @e1

# MUST re-snapshot to get new refs!
banana-browser snapshot -i
# @e1 [h1] "Page 2"  ← Different element now!
```

## Best Practices

### 1. Always Snapshot Before Interacting

```bash
# CORRECT
banana-browser open https://example.com
banana-browser snapshot -i          # Get refs first
banana-browser click @e1            # Use ref

# WRONG
banana-browser open https://example.com
banana-browser click @e1            # Ref doesn't exist yet!
```

### 2. Re-Snapshot After Navigation

```bash
banana-browser click @e5            # Navigates to new page
banana-browser snapshot -i          # Get new refs
banana-browser click @e1            # Use new refs
```

### 3. Re-Snapshot After Dynamic Changes

```bash
banana-browser click @e1            # Opens dropdown
banana-browser snapshot -i          # See dropdown items
banana-browser click @e7            # Select item
```

### 4. Snapshot Specific Regions

For complex pages, snapshot specific areas:

```bash
# Snapshot just the form
banana-browser snapshot @e9
```

## Ref Notation Details

```
@e1 [tag type="value"] "text content" placeholder="hint"
│    │   │             │               │
│    │   │             │               └─ Additional attributes
│    │   │             └─ Visible text
│    │   └─ Key attributes shown
│    └─ HTML tag name
└─ Unique ref ID
```

### Common Patterns

```
@e1 [button] "Submit"                    # Button with text
@e2 [input type="email"]                 # Email input
@e3 [input type="password"]              # Password input
@e4 [a href="/page"] "Link Text"         # Anchor link
@e5 [select]                             # Dropdown
@e6 [textarea] placeholder="Message"     # Text area
@e7 [div class="modal"]                  # Container (when relevant)
@e8 [img alt="Logo"]                     # Image
@e9 [checkbox] checked                   # Checked checkbox
@e10 [radio] selected                    # Selected radio
```

## Troubleshooting

### "Ref not found" Error

```bash
# Ref may have changed - re-snapshot
banana-browser snapshot -i
```

### Element Not Visible in Snapshot

```bash
# Scroll down to reveal element
banana-browser scroll down 1000
banana-browser snapshot -i

# Or wait for dynamic content
banana-browser wait 1000
banana-browser snapshot -i
```

### Too Many Elements

```bash
# Snapshot specific container
banana-browser snapshot @e5

# Or use get text for content-only extraction
banana-browser get text @e5
```

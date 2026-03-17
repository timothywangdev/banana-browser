# Video Recording

Capture browser automation as video for debugging, documentation, or verification.

**Related**: [commands.md](commands.md) for full command reference, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Basic Recording](#basic-recording)
- [Recording Commands](#recording-commands)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)
- [Output Format](#output-format)
- [Limitations](#limitations)

## Basic Recording

```bash
# Start recording
banana-browser record start ./demo.webm

# Perform actions
banana-browser open https://example.com
banana-browser snapshot -i
banana-browser click @e1
banana-browser fill @e2 "test input"

# Stop and save
banana-browser record stop
```

## Recording Commands

```bash
# Start recording to file
banana-browser record start ./output.webm

# Stop current recording
banana-browser record stop

# Restart with new file (stops current + starts new)
banana-browser record restart ./take2.webm
```

## Use Cases

### Debugging Failed Automation

```bash
#!/bin/bash
# Record automation for debugging

banana-browser record start ./debug-$(date +%Y%m%d-%H%M%S).webm

# Run your automation
banana-browser open https://app.example.com
banana-browser snapshot -i
banana-browser click @e1 || {
    echo "Click failed - check recording"
    banana-browser record stop
    exit 1
}

banana-browser record stop
```

### Documentation Generation

```bash
#!/bin/bash
# Record workflow for documentation

banana-browser record start ./docs/how-to-login.webm

banana-browser open https://app.example.com/login
banana-browser wait 1000  # Pause for visibility

banana-browser snapshot -i
banana-browser fill @e1 "demo@example.com"
banana-browser wait 500

banana-browser fill @e2 "password"
banana-browser wait 500

banana-browser click @e3
banana-browser wait --load networkidle
banana-browser wait 1000  # Show result

banana-browser record stop
```

### CI/CD Test Evidence

```bash
#!/bin/bash
# Record E2E test runs for CI artifacts

TEST_NAME="${1:-e2e-test}"
RECORDING_DIR="./test-recordings"
mkdir -p "$RECORDING_DIR"

banana-browser record start "$RECORDING_DIR/$TEST_NAME-$(date +%s).webm"

# Run test
if run_e2e_test; then
    echo "Test passed"
else
    echo "Test failed - recording saved"
fi

banana-browser record stop
```

## Best Practices

### 1. Add Pauses for Clarity

```bash
# Slow down for human viewing
banana-browser click @e1
banana-browser wait 500  # Let viewer see result
```

### 2. Use Descriptive Filenames

```bash
# Include context in filename
banana-browser record start ./recordings/login-flow-2024-01-15.webm
banana-browser record start ./recordings/checkout-test-run-42.webm
```

### 3. Handle Recording in Error Cases

```bash
#!/bin/bash
set -e

cleanup() {
    banana-browser record stop 2>/dev/null || true
    banana-browser close 2>/dev/null || true
}
trap cleanup EXIT

banana-browser record start ./automation.webm
# ... automation steps ...
```

### 4. Combine with Screenshots

```bash
# Record video AND capture key frames
banana-browser record start ./flow.webm

banana-browser open https://example.com
banana-browser screenshot ./screenshots/step1-homepage.png

banana-browser click @e1
banana-browser screenshot ./screenshots/step2-after-click.png

banana-browser record stop
```

## Output Format

- Default format: WebM (VP8/VP9 codec)
- Compatible with all modern browsers and video players
- Compressed but high quality

## Limitations

- Recording adds slight overhead to automation
- Large recordings can consume significant disk space
- Some headless environments may have codec limitations

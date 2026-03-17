# Banana Browser

**The browser tool for AI agents that doesn't get caught.**

[![npm version](https://img.shields.io/npm/v/banana-browser.svg)](https://www.npmjs.com/package/banana-browser)
[![npm downloads](https://img.shields.io/npm/dm/banana-browser.svg)](https://www.npmjs.com/package/banana-browser)
[![License](https://img.shields.io/npm/l/banana-browser.svg)](https://github.com/timothywangdev/banana-browser/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timothywangdev/banana-browser.svg?style=social)](https://github.com/timothywangdev/banana-browser)

---

<p align="center">
  <img src="assets/demo.gif" alt="Banana Browser Demo - 100% bot detection pass rate" width="600">
</p>

---

## The Problem

AI agents that browse the web hit three walls:

1. **Bot detection** - Playwright and Puppeteer get flagged by Cloudflare, reCAPTCHA, and DataDome. Agents get stuck on CAPTCHAs or blocked entirely.

2. **Credential exposure** - When an agent logs into a website, the password flows through the LLM context, gets sent to the API, and sits in conversation history. Security hole.

3. **CAPTCHAs** - Even with stealth, CAPTCHAs still appear. Agents can't solve them. Users have to intervene manually.

---

## The Solution

Banana Browser is a fork of [agent-browser](https://github.com/vercel-labs/agent-browser) with three capabilities no other self-hosted tool offers:

| Capability | Status | How |
|------------|--------|-----|
| **Anti-detection** | Ready | Patchright removes CDP leaks that trigger bot detection |
| **Secure credentials** | Ready | `--secret` flag injects passwords without LLM exposure |
| **CAPTCHA solving** | Planned | Auto-solve via 2Captcha/CapSolver |

---

## Try It Now

```bash
npx banana-browser demo
```

Watch your browser pass every bot detection test.

---

## Who It's For

Self-hosted AI agent platforms:

- **OpenClaw** - The fastest-growing AI agent repo
- **NanoClaw** - Lightweight agent framework
- **OpenHands**, **browser-use**, and similar frameworks
- Anyone running AI agents in containers who needs web browsing

These users chose self-hosted for privacy. They won't pay $50+/month for Browserbase. Banana Browser is free and runs locally.

---

## Installation

```bash
npm install -g banana-browser
banana-browser install   # Downloads Chromium
```

Or try without installing:

```bash
npx banana-browser demo
```

---

## Quick Start

```bash
# Run the bot detection demo
banana-browser demo

# Navigate to a page
banana-browser open https://example.com

# Fill a form (password never touches LLM context)
banana-browser fill "#email" "user@example.com"
banana-browser fill "#password" --secret GITHUB_PASSWORD

# Take a screenshot
banana-browser screenshot result.png
```

---

## Bot Detection Results

| Test | Puppeteer | Playwright | Banana Browser |
|------|-----------|------------|----------------|
| navigator.webdriver | FAIL | FAIL | PASS |
| Chrome headless detection | FAIL | FAIL | PASS |
| Fingerprint consistency | FAIL | FAIL | PASS |
| Cloudflare challenge | FAIL | FAIL | PASS |
| DataDome | FAIL | FAIL | PASS |

Powered by [Patchright](https://github.com/AzaelDiaz/patchright) - the undetectable Playwright fork.

---

## Secure Credential Injection

The `--secret` flag reads credentials from a local file and injects them directly into form fields. **The LLM never sees the password.**

```bash
# The agent runs this command
banana-browser fill "#password" --secret GITHUB_PASSWORD

# The agent's output shows
"Filled password field using stored credential"

# The actual password
Never appears in any LLM context, log, or API call
```

**Security features:**

- Secret values never written to stdout
- Mandatory URL allowlisting (secrets only work on specified domains)
- Audit logging

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `banana-browser demo` | Run bot detection tests |
| `banana-browser install` | Install Chromium |
| `banana-browser open <url>` | Navigate to URL |
| `banana-browser click <selector>` | Click element |
| `banana-browser fill <selector> <text>` | Fill form field |
| `banana-browser fill <selector> --secret KEY` | Fill from secrets file |
| `banana-browser screenshot [path]` | Take screenshot |
| `banana-browser close` | Close browser |
| `banana-browser --version` | Show version |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENT_BROWSER_ENGINE=patchright` | Use Patchright anti-detection |
| `AGENT_BROWSER_HEADLESS=true` | Run headless |
| `BB_SECRETS_FILE=/path/to/secrets.json` | Path to secrets file |

---

## Roadmap

- [x] Anti-detection via Patchright
- [x] Secure credential injection (`--secret`)
- [ ] Automatic CAPTCHA solving (2Captcha, CapSolver)
- [ ] Snapshot sanitization (prevent prompt injection via hidden text)
- [ ] MCP server mode

---

## Contributing

```bash
git clone https://github.com/timothywangdev/banana-browser
cd banana-browser
npm install
npm run dev:setup
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

Apache-2.0 - See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>If this saves you time, give us a star!</strong>
  <br>
  <a href="https://github.com/timothywangdev/banana-browser">Star on GitHub</a>
</p>

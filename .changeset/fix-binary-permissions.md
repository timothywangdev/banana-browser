---
"agent-browser": patch
---

Fix binary permissions on install. npm doesn't preserve execute bits, so postinstall now ensures the native binary is executable.

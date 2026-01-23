---
"agent-browser": patch
---

Fix native binary distribution in npm package

Native binaries for all platforms (Linux x64/arm64, macOS x64/arm64, Windows x64) are now included in the npm package. Previously, the release workflow published to npm before building binaries, causing "No binary found" errors on installation.

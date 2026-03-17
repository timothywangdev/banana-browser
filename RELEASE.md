# Release Checklist

Pre-publish checklist for banana-browser npm package.

## Version Sync

Before releasing, ensure versions are consistent:

```bash
# Sync version from package.json to Cargo.toml
npm run version:sync

# Verify versions match
cat package.json | grep '"version"'
cat cli/Cargo.toml | grep '^version'
```

The `version:sync` script automatically updates `cli/Cargo.toml` to match `package.json`.

## Package Size Check

The npm package must be under 5MB for fast installation.

```bash
# Create package tarball
npm pack

# Check size (should be <5MB)
ls -lh banana-browser-*.tgz

# Inspect contents
tar -tzf banana-browser-*.tgz | head -50

# Clean up
rm banana-browser-*.tgz
```

**Note**: The package does NOT include platform binaries. Binaries are downloaded from GitHub Releases during `postinstall`.

## Platform Testing Checklist

Test on all supported platforms before release:

### Linux x64

```bash
docker run -it --rm node:20 bash -c "npm install -g banana-browser && banana-browser --version"
```

### macOS ARM64 (M1/M2/M3)

```bash
npm install -g banana-browser && banana-browser --version
```

### macOS x64 (Intel or Rosetta)

```bash
arch -x86_64 bash -c "npm install -g banana-browser && banana-browser --version"
```

### Windows x64

```powershell
npm install -g banana-browser
banana-browser --version
```

## Pre-Release Checklist

- [ ] All platform binaries built via GitHub Actions release workflow
- [ ] Binaries uploaded to GitHub Release assets
- [ ] `npm pack` produces package under 5MB
- [ ] Version numbers consistent (package.json, Cargo.toml, CLI output)
- [ ] README renders correctly on GitHub
- [ ] Demo GIF displays properly
- [ ] `npx banana-browser demo` works from npm registry
- [ ] `npx banana-browser --help` shows all commands
- [ ] Star prompt appears once per user (first demo only)
- [ ] `--quiet` flag suppresses promotional output
- [ ] CONTRIBUTING.md steps verified on fresh clone
- [ ] All tests pass: `npm test`

## Release Commands

### Using Changesets (Recommended)

```bash
# Create changeset
npx changeset

# Version packages
npm run ci:version

# Publish to npm
npm run ci:publish
```

### Manual Release

```bash
# Ensure everything is synced
npm run version:sync

# Build all platform binaries
npm run build:all-platforms

# Publish to npm
npm publish
```

## Post-Release Verification

After publishing, verify the package works:

```bash
# Clear npm cache
npm cache clean --force

# Test npx flow
npx banana-browser@latest demo

# Test global install
npm install -g banana-browser@latest
banana-browser --version
```

## Rollback

If issues are found after release:

```bash
# Deprecate problematic version
npm deprecate banana-browser@X.Y.Z "Critical bug, please upgrade to X.Y.Z+1"

# Or unpublish within 72 hours (use sparingly)
npm unpublish banana-browser@X.Y.Z
```

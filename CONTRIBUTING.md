# Contributing to banana-browser

Thank you for your interest in contributing to banana-browser! This guide will help you set up your development environment and get started contributing.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 20+** - [Download](https://nodejs.org/) or use [nvm](https://github.com/nvm-sh/nvm)
- **Rust toolchain** - [Install via rustup](https://rustup.rs/)
- **Git** - [Download](https://git-scm.com/)

### Verify Prerequisites

```bash
node --version    # Should be v20.x.x or higher
npm --version     # Should be v10.x.x or higher
rustc --version   # Should be 1.70.0 or higher
cargo --version   # Should match rustc version
git --version     # Any recent version
```

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/vercel-labs/agent-browser.git
cd agent-browser
```

### 2. Run Dev Setup

This command installs all dependencies and verifies your toolchain:

```bash
npm run dev:setup
```

The setup script will:
- Check for Node.js and Rust toolchain
- Install npm dependencies
- Build the patchright-adapter (if present)
- Verify everything is ready

### 3. Run Tests

```bash
npm test
```

### 4. Build Locally

```bash
npm run build:native
```

This builds the native Rust binary for your platform.

## Development Workflow

### Project Structure

```
banana-browser/
  bin/               # CLI entry point
  lib/               # Shared JavaScript modules
  scripts/           # Build and utility scripts
  tests/             # Test files
  cli/               # Rust CLI source (Cargo.toml)
```

### Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev:setup` | Install dependencies and check toolchain |
| `npm test` | Run test suite |
| `npm run build:native` | Build native binary for current platform |
| `npm run demo` | Run the demo command locally |

### Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes

3. Run tests:
   ```bash
   npm test
   ```

4. Commit your changes:
   ```bash
   git add .
   git commit -m "feat: description of your changes"
   ```

## Submitting Pull Requests

### Before Submitting

- [ ] Run `npm test` and ensure all tests pass
- [ ] Run `npm run build:native` and verify the build succeeds
- [ ] Test your changes locally with `npm run demo`
- [ ] Update documentation if needed

### PR Guidelines

1. **Keep PRs focused** - One feature or fix per PR
2. **Write descriptive titles** - Use conventional commit format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `refactor:` for code refactoring
   - `test:` for adding tests
   - `chore:` for maintenance tasks

3. **Include context** - Explain what the PR does and why

4. **Link issues** - Reference any related issues with `Fixes #123` or `Relates to #456`

### PR Template

```markdown
## Summary

Brief description of changes.

## Test Plan

- [ ] Tested locally with `npm run demo`
- [ ] All tests pass
- [ ] Build succeeds on target platform
```

## Code Style Guidelines

### JavaScript

- Use ES modules (`import`/`export`)
- Use JSDoc comments for public functions
- Prefer `const` over `let`
- Use meaningful variable names
- Handle errors gracefully with try/catch

### Rust

- Follow standard Rust conventions (`cargo fmt`)
- Run `cargo clippy` before committing
- Write doc comments for public APIs
- Use Result types for error handling

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Examples:
- `feat(cli): add --headless flag to demo command`
- `fix(platform): handle musl detection on Alpine`
- `docs: update installation instructions`

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with verbose output
npm test -- --test-reporter spec
```

### Writing Tests

Tests are located in `tests/` and use Node.js built-in test runner:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';

test('my test', () => {
  assert.strictEqual(1 + 1, 2);
});
```

## Getting Help

### Questions?

- **GitHub Issues** - For bugs and feature requests
- **Discussions** - For questions and general discussion

### Useful Resources

- [Node.js Test Runner Docs](https://nodejs.org/api/test.html)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Patchright Documentation](https://github.com/nickspaargaren/patchright)

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.

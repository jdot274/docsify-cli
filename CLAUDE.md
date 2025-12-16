# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

docsify-cli is a command-line tool for generating and serving documentation sites powered by Docsify. It provides three main commands: `init`, `serve`, and `generate`.

## Development Commands

### Build
```bash
npm run build
```
Builds the CLI using Rollup, compiling `lib/cli.js` into `bin/docsify` with a Node shebang. The `bin/` directory is cleaned before each build.

### Testing
```bash
npm test          # Runs lint + ava tests
npm run pretest   # Lint only
ava               # Run tests directly
```
Tests are located in `e2e/` and use AVA test runner with snapshot testing.

### Linting
```bash
npm run lint      # Check for lint errors
npm run lint:fix  # Auto-fix lint errors
```
Uses ESLint with `xo-space` config and custom rules (no semicolons, etc.) defined in `eslint.config.mjs`.

### Local Development Setup
After making changes:
```bash
npm install
npm run build
npm link          # Makes docsify command available globally
```
After each code edit, re-run `npm run build` to update the global executable.

## Architecture

### CLI Structure
- **Entry point**: `lib/cli.js` - Uses yargs for command parsing with yargonaut for colored output
- **Commands module**: `lib/index.js` - Exports the three command handlers
- **Command handlers**: `lib/commands/{init,serve,generate}.js`
- **Utilities**: `lib/util/` - Helper functions for file operations and logging
- **Localization**: `tools/locales/` - i18n support via y18n

### Build Process
Rollup bundles `lib/cli.js` → `bin/docsify` as CommonJS with executable permissions and `#!/usr/bin/env node` shebang.

### Command Implementations

**init**: Creates a new docs site with `index.html`, `README.md`, and `.nojekyll`. Uses enquirer for interactive prompts (theme selection, plugin selection). Supports `--local` (copy docsify files locally vs CDN), `--rcMode` (use RC version), `--theme`, and `--plugins` flags.

**serve**: Runs a local development server using Connect with livereload, history API fallback, and static file serving. Uses `get-port` to find available ports. Key features:
- Livereload watches `.md` files (excludes `node_modules/`)
- History API fallback for SPA routing
- Configurable host (via `-H`), port (`-p`), livereload port (`-P`), and index file name (`-i`)

**generate**: Recursively scans a directory for `.md` files and generates a `_sidebar.md` file. Ignores special files (`_navbar`, `_coverpage`, `_sidebar`). Converts filenames to camel case for display.

### Utilities (`lib/util/index.js`)
- `cwd(path)` - Resolve path relative to current working directory
- `pwd(path)` - Resolve path relative to lib directory
- `exists(path)` - Check if path exists
- `pkg()` - Load package.json from cwd
- `read(path)` - Read file as UTF-8 string

### Template System
Templates in `lib/template/` are copied during init. The `index.html` template uses placeholder replacement (`__docsifyVersion__`, `Document`, `name: ''`, etc.) filled with values from user's `package.json` and CLI options.

## Release Process
```bash
npm run release   # Runs build + standard-version for changelog/versioning
```
Uses conventional commits for changelog generation. Post-bump hook runs `ava e2e/cli.test.js -u` to update snapshots.

## Dependencies
- **Connect ecosystem**: `connect`, `serve-static`, `connect-livereload`, `connect-history-api-fallback`
- **Livereload**: `livereload` package for file watching
- **CLI tools**: `yargs`, `yargonaut`, `enquirer`, `chalk`
- **File operations**: `fs-extra`, `cp-file`
- **Utilities**: `get-port`, `open`, `semver`

## Commit Convention
Follow [commitlint conventional naming rules](https://www.npmjs.com/package/@commitlint/config-conventional#rules). Examples: `feat:`, `fix:`, `chore:`, `docs:`.

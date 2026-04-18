# Development

This repository is currently named `cosgroma/vscode-vivado`. The codebase still contains Vitis HLS extension naming and behavior, but new development should move toward Vivado project support.

## Install Dependencies

Install Node dependencies from the lockfile:

```powershell
npm ci
```

Install documentation dependencies:

```powershell
python -m pip install -r requirements-docs.txt
```

## Build The Extension

Compile TypeScript:

```powershell
npm run compile
```

Run lint:

```powershell
npm run lint
```

## Run The Extension Locally

Use the `Run Extension` launch configuration in VS Code. It compiles the extension and opens a new Extension Development Host window.

Open a workspace containing an `hls.app` file to activate the current implementation.

For Vivado support work, use a fixture workspace with a small `.xpr` project once `.xpr` activation and parsing are added.

## Vivado Development Direction

Prioritize changes in this order:

- Read-only `.xpr` discovery and metadata parsing.
- Tree provider changes for Vivado sources, constraints, IP, block designs, runs, and reports.
- TCL-backed task creation for synthesis, implementation, bitstream, and simulation.
- Problem matchers and diagnostics for Vivado messages.
- Conservative project editing commands after parser and tree behavior are tested.

## Build Documentation

Build the static documentation site:

```powershell
python -m mkdocs build --strict
```

Serve the documentation locally while editing:

```powershell
python -m mkdocs serve
```

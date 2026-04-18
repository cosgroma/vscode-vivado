# Testing

## Current Test Command

Run the extension test suite:

```powershell
npm test
```

The test command runs:

- TypeScript compilation.
- ESLint.
- VS Code extension tests through `@vscode/test-cli`.

## Current Coverage

The current test suite contains the generated sample test only. It verifies that the VS Code test runner can launch, but it does not yet cover extension behavior.

## Coverage Support References

Coverage support has two different meanings for this project:

- Measuring coverage of the extension's own TypeScript tests.
- Exposing Vivado, XSim, or HDL regression coverage through VS Code once the extension has a real Vivado test surface.

Useful references:

- [VS Code Testing](https://code.visualstudio.com/docs/debugtest/testing): user-facing Test Explorer and Test Coverage behavior. VS Code can show coverage in the Test Coverage view, editor gutter, Explorer, diff editor, and coverage toolbar when a testing extension provides coverage data.
- [VS Code Testing API](https://code.visualstudio.com/api/extension-guides/testing): extension-author API for test discovery, run profiles, and coverage. Coverage data is attached to a `TestRun` with `run.addCoverage()`, usually from a `TestRunProfileKind.Coverage` profile.
- [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension): official setup for extension integration tests with `@vscode/test-cli`, `@vscode/test-electron`, Mocha, and the Microsoft Extension Test Runner.
- [VS Code Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner): marketplace extension for running this repo's `.vscode-test`-based extension tests from the VS Code Testing view.
- [Coverage Gutters](https://marketplace.visualstudio.com/items?itemName=ryanluker.vscode-coverage-gutters): language-agnostic local coverage viewer for LCOV/XML coverage files.
- [VSCode LCOV](https://marketplace.visualstudio.com/items?itemName=alexdima.vscode-lcov): focused LCOV viewer with line and branch coverage rendering, report generation, watch support, and JavaScript source map support.
- [Vitest VS Code extension](https://marketplace.visualstudio.com/items?itemName=vitest.explorer): useful reference if unit tests move from Mocha-only extension-host tests toward a faster Vitest layer; the extension supports Test Explorer integration and coverage.

Near-term, keep `@vscode/test-cli` for extension-host integration tests and add a separate fast unit-test layer before chasing coverage percentages. Once coverage output exists, prefer LCOV so external viewers and CI services can consume the same artifact.

## Mock Workspaces

Create a disposable mock workspace for manual extension testing:

```powershell
npm run mock:workspace
```

By default this creates an HLS workspace under `scratch/mock-hls-workspace`. Open that folder in the Extension Development Host to activate the extension and inspect the Projects tree.

Choose the fixture shape with `--type`:

```powershell
npm run mock:workspace -- --type hls --force
npm run mock:workspace -- --type vivado --force
npm run mock:workspace -- --type mixed --force
```

Useful options:

- `--root <path>` sets the output folder.
- `--name <name>` sets the project name.
- `--top <identifier>` sets the HLS top function name.
- `--solutions <a,b>` sets HLS solution names.
- `--part <part>` and `--board <board>` set Vivado metadata.
- `--force` replaces an existing mock workspace.

The `hls` and `mixed` fixtures activate the current extension because they contain an `hls.app` file. The `vivado` fixture activates the extension because it contains a `.xpr` file, matching the `workspaceContains:**/*.xpr` activation event.

## Current HLS Coverage Targets

Add tests for these areas first:

- `HLSProject.fromFile` parsing for valid, empty, and malformed `hls.app` files.
- Project manager refresh behavior for added, changed, and removed projects.
- Projects tree grouping and sorting for source files, test bench files, and solutions.
- Add/remove file commands, including cancellation and test bench path handling.
- Run commands, including TCL generation, missing settings, exit code handling, and missing logs.
- C++ properties checks for missing settings and partial `c_cpp_properties.json` configurations.

## To-Be Vivado Coverage Targets

Vivado support should be test-first where possible. Add coverage for:

- `.xpr` discovery and activation.
- Vivado project metadata parsing.
- Fileset grouping for design sources, simulation sources, and constraints.
- IP, block design, and TCL script tree items.
- Generated TCL for synthesis, implementation, bitstream, and simulation tasks.
- Vivado problem matchers for warnings and errors.
- Missing Vivado installation handling.
- Paths with spaces on Windows.
- Read-only behavior that never rewrites `.xpr` files during discovery.

## VS Code Test Workspaces

Useful next fixtures:

- A minimal Vitis HLS project for the inherited `hls.app` behavior.
- A minimal Vivado `.xpr` project for the target workflow.
- A script-only Vivado TCL workspace for users who do not check in generated project files.

Integration tests can open those workspaces, activate the extension, and assert that project tree nodes and commands are registered.

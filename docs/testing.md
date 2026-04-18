# Testing

## Purpose

This project needs two things at the same time:

- fast and reliable confidence for normal pull requests,
- and enough real-tool validation to catch integration mistakes at the Vivado boundary.

Those goals are in tension when a feature depends on large vendor tools, licenses,
and machine-specific setup. The testing strategy for this repository should
therefore keep most coverage vendor-free, then add a small amount of real
Vivado-backed validation where it provides the most value.

## Current State

Run the current test command with:

```powershell
npm test
```

Today that command runs:

- TypeScript compilation.
- ESLint.
- VS Code extension tests through `@vscode/test-cli`.

The current suite is still early. The harness is in place, but the repository is
not yet getting most of its confidence from behavioral tests.

## Testing Principles

Use these rules to guide all new test work:

1. Keep ordinary pull request checks fast and license-free.
2. Push logic into testable modules before adding more UI-only tests.
3. Treat Vivado execution as a boundary with a small, explicit surface.
4. Prefer deterministic fixtures over large generated workspaces.
5. Keep vendor-backed tests small, high-signal, and easy to rerun.
6. Do not make contributors depend on a local Vivado install unless the change
   truly needs it.

## Test Layers

The repository should use four test layers.

### Layer 1: Pure unit tests

This should become the largest test layer.

These tests should run in plain Node without launching VS Code and without
requiring Vivado. Focus first on modules that transform input files and settings
into internal models or generated commands.

Good targets:

- `.xpr` parsing and metadata extraction,
- `hls.app` parsing and validation,
- fileset grouping,
- project model creation,
- tree model building before conversion to VS Code `TreeItem` objects,
- TCL generation,
- command-line construction,
- tool path resolution,
- problem matcher parsing,
- path normalization and path-with-spaces handling.

These tests should be the default place to add coverage when new behavior is
introduced.

### Layer 2: Extension-host integration tests

Use the existing VS Code extension test harness for integration behavior that
needs a real extension host.

These tests should verify things such as:

- activation on `hls.app` workspaces,
- activation on `.xpr` workspaces,
- command registration,
- project discovery wiring,
- tree provider population,
- expected user-facing errors for missing settings or missing tools,
- diagnostics surfaced from parsed tool output.

These tests should still avoid calling Vivado directly when possible. Prefer
fakes or stubs for process execution so the extension behavior can be tested
without a vendor install.

### Layer 3: Tool contract tests

This layer verifies the contract between the extension and Vivado without
requiring a real Vivado run.

Typical assertions:

- correct executable selection,
- correct working directory,
- correct command-line arguments,
- correct environment variables,
- correct generated TCL scripts,
- correct expected output file locations,
- correct parsing of representative stdout, stderr, and log files.

These tests are especially valuable because they lock down the tool boundary
without introducing CI fragility.

### Layer 4: Vendor-backed smoke tests

Keep this layer intentionally small.

These tests run only where Vivado is actually installed and licensed. Their job
is to prove that the contract still works with the real toolchain, not to carry
all repository quality by themselves.

Good smoke-test candidates:

- launch Vivado in batch mode against a tiny fixture project,
- run a harmless metadata or report query,
- verify that generated TCL executes successfully,
- verify basic warning and error parsing against real tool output,
- optionally run one very small synthesis-oriented flow if runtime is acceptable.

Avoid turning this layer into a large regression suite. It will be slower,
harder to debug, and harder to keep portable.

## Fixture Strategy

The repository already has mock workspace support. Keep that, but move toward a
stable fixture layout for automated testing.

Recommended layout:

```text
src/
  test/
    fixtures/
      hls/
        minimal-valid/
        malformed-app/
      vivado/
        minimal-xpr/
        spaces-in-path/
        missing-files/
        read-only-project/
      mixed/
        minimal/
```

For fixtures that drive parsing or tree-model tests, add expected normalized
outputs beside the fixture where helpful. Examples:

```text
expected-project-model.json
expected-tree.json
expected-generated-tcl.tcl
```

Use deterministic fixtures for automated tests. Keep generated mock workspaces
for manual bring-up, demos, and exploratory local development.

## CI Strategy

### Required checks on all pull requests

Every pull request should run only checks that are fast, reproducible, and do
not require Vivado.

Recommended required checks:

- install dependencies,
- compile TypeScript,
- run ESLint,
- run pure unit tests,
- run extension-host integration tests with fake tool runners,
- run fixture and snapshot tests if present.

These checks should be the main branch-protection gates.

### Vendor-backed CI

Vivado-backed tests should run separately from ordinary pull request gates.

Recommended options:

- self-hosted runner with Vivado installed,
- manually triggered workflow,
- scheduled nightly workflow,
- label-gated or branch-gated workflow for changes that touch the tool boundary.

Good triggers include changes under areas such as:

- Vivado process-launch code,
- TCL generation,
- project parsing,
- problem matcher logic,
- tool-location logic,
- CI or workflow definitions for vendor-backed testing.

Unless the repository later gains a stable and well-maintained private runner
fleet, do not make every public pull request depend on Vivado-backed jobs.

### Release readiness

Before a release or marketplace publish, require both:

- all ordinary pull request checks green,
- the vendor-backed smoke workflow green for the supported tool version or
  versions.

This keeps everyday development efficient while still giving release builds a
real toolchain checkpoint.

## Design Guidance For Testability

The easiest way to improve testing is to improve boundaries in the code.

Prefer designs like:

```text
workspace files -> project model -> tree model -> VS Code UI objects
```

and:

```text
action request -> command builder -> process runner -> parsed result
```

Practical guidance:

- Keep parsing separate from UI code.
- Keep tree-model creation separate from `TreeItem` creation.
- Keep TCL generation separate from process launch.
- Introduce a small process-runner abstraction so tests can inject a fake runner.
- Normalize tool output before asserting on it.
- Test intermediate models where possible instead of only asserting on labels in
  the UI.

This structure makes both unit tests and extension-host tests easier to write and
less brittle.

## Local Development Workflows

### Basic test run

Run the normal repository checks:

```powershell
npm test
```

### Mock workspaces for manual testing

Create a disposable mock workspace:

```powershell
npm run mock:workspace
```

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

The `hls` and `mixed` fixtures activate the extension because they contain an
`hls.app` file. The `vivado` fixture activates the extension because it contains
a `.xpr` file, matching the `workspaceContains:**/*.xpr` activation event.

## Near-Term Priorities

Add coverage in this order.

### 1. Fast unit-test foundation

Start by covering:

- `hls.app` parsing for valid, empty, and malformed inputs,
- `.xpr` parsing for valid, partial, and malformed inputs,
- model-building and grouping logic,
- generated TCL for current and planned run commands,
- tool-path discovery and missing-tool handling,
- path normalization with Windows path edge cases.

### 2. Extension-host behavior

Then cover:

- workspace activation,
- project refresh behavior,
- command registration,
- tree-node presence and grouping,
- missing-setting and missing-tool user messages.

### 3. Tool contract coverage

Next, add tests that verify:

- launch arguments,
- environment setup,
- working-directory selection,
- expected log and report locations,
- parsing of representative tool output.

### 4. Minimal real-tool smoke coverage

Finally, add a very small Vivado-backed smoke workflow on infrastructure that
already has the tool installed and licensed.

## What Not To Do

Avoid these patterns:

- making extension-host tests the only serious test layer,
- requiring Vivado for normal pull request validation,
- asserting only on UI text when a model-level assertion would be more stable,
- using large generated projects as the main automated fixtures,
- depending on exact raw vendor output formatting when normalized parsing would
  be more robust,
- turning real-tool CI into a slow full regression suite.

## Summary

The repository should get most of its confidence from small, deterministic,
vendor-free tests. Real Vivado-backed testing is still important, but it should
be narrow, intentional, and separated from ordinary contributor workflows.

That balance is the most practical path for a VS Code extension that integrates
with large licensed FPGA tools.

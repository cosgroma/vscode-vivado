# Issue Dependency Plan

This plan captures the recommended issue execution order for the current backlog.
It treats the `v0.2.3 Test coverage` milestone as a required stabilization gate
before new Vivado feature development starts.

## Execution Principles

- Finish coverage infrastructure before using coverage percentage as a release gate.
- Prefer isolated tests before tests that need broad VS Code API stubbing.
- Keep current HLS behavior covered before refactoring it for Vivado support.
- Build Vivado support from execution/configuration primitives upward into UI,
  diagnostics, reports, IP, block designs, and hardware flows.
- Keep later milestones open to adjustment as implementation details become clearer.

## Milestone Order

1. `v0.2.3 Test coverage`
2. `v0.3.0 Vivado foundation`
3. `v0.4.0 Vivado project model and tree`
4. `v0.5.0 Vivado run management`
5. `v0.6.0 Diagnostics, reports, and XSim`
6. `v0.7.0 IP, block designs, and hardware`
7. `v1.0.0 Vivado-ready release`

## v0.2.3 Test Coverage Gate

The goal for this milestone is to make the current extension behavior measurable,
tested, and protected before adding new Vivado behavior.

| Order | Issue | Dependencies | Notes |
| --- | --- | --- | --- |
| 1 | [#22 Add coverage tooling and enforce 100% thresholds](https://github.com/cosgroma/vscode-vivado/issues/22) | None | Establishes the measurement and CI gate used by the rest of this milestone. |
| 2 | [#24 Test HLS project XML parsing and model behavior](https://github.com/cosgroma/vscode-vivado/issues/24) | #22 | Low-risk model tests that create reusable fixtures for project, tree, and command tests. |
| 3 | [#31 Test OutputConsole singleton and channel forwarding](https://github.com/cosgroma/vscode-vivado/issues/31) | #22 | Small isolated coverage win and useful test pattern for VS Code API stubbing. |
| 4 | [#32 Add package contribution and docs consistency checks for claimed features](https://github.com/cosgroma/vscode-vivado/issues/32) | #22 | Helps ensure manifest/docs claims stay aligned with implementation. |
| 5 | [#30 Test vitisRun task creation and cleanup](https://github.com/cosgroma/vscode-vivado/issues/30) | #22 | Establishes task execution stubs needed by run and stop command tests. |
| 6 | [#25 Test ProjectManager refresh lifecycle and error handling](https://github.com/cosgroma/vscode-vivado/issues/25) | #22, #24 | Uses model fixtures and validates discovery/update/remove/error behavior. |
| 7 | [#23 Test extension activation, command registration, and C++ properties checks](https://github.com/cosgroma/vscode-vivado/issues/23) | #22, #31 | Exercises activation side effects, prompts, workspace file reads, and command registration. |
| 8 | [#26 Test Projects tree provider structure and run item states](https://github.com/cosgroma/vscode-vivado/issues/26) | #24, #25, #30 | Depends on project fixtures, manager behavior, and task/debug state stubs. |
| 9 | [#27 Test add/remove HLS project file commands](https://github.com/cosgroma/vscode-vivado/issues/27) | #24, #30 | Covers TCL generation, XML mutation, file picker/prompt branches, and refresh triggering. |
| 10 | [#28 Test HLS run command orchestration](https://github.com/cosgroma/vscode-vivado/issues/28) | #24, #30, #31 | Covers C simulation, C synthesis, cosimulation, output, debug, and failure paths. |
| 11 | [#29 Test HLS stop command behavior](https://github.com/cosgroma/vscode-vivado/issues/29) | #28, #30, #31 | Stop behavior is easiest to validate after task/debug stubs and run command expectations are settled. |

### v0.2.3 Parallel Work

After #22 is complete, #24, #31, and #32 can proceed in parallel. After #30 is
complete, #27 and #28 can proceed in parallel. #26 should wait until #24, #25,
and #30 are stable because it touches model, manager, task, and debug behavior.

## Vivado Feature Milestones

Vivado development should start only after the `v0.2.3 Test coverage` milestone
is closed or the project owner explicitly accepts the coverage risk.

### v0.3.0 Vivado Foundation

| Order | Issue | Dependencies | Notes |
| --- | --- | --- | --- |
| 1 | [#3 Activate extension for Vivado .xpr workspaces](https://github.com/cosgroma/vscode-vivado/issues/3) | v0.2.3 closed | Small activation change that verifies Vivado workspaces can enter the extension. |
| 2 | [#4 Add Vivado path and execution settings](https://github.com/cosgroma/vscode-vivado/issues/4) | #3 | Defines the configuration contract used by execution and commands. |
| 3 | [#5 Implement vivadoRun helper for TCL-backed batch tasks](https://github.com/cosgroma/vscode-vivado/issues/5) | #4 | Core execution primitive for later Vivado actions. |
| 4 | [#6 Generate visible TCL for extension-driven Vivado actions](https://github.com/cosgroma/vscode-vivado/issues/6) | #5 | Makes execution auditable and reusable outside VS Code. |

### v0.4.0 Vivado Project Model And Tree

| Order | Issue | Dependencies | Notes |
| --- | --- | --- | --- |
| 1 | [#7 Introduce Vivado domain models](https://github.com/cosgroma/vscode-vivado/issues/7) | #3, #4 | Establishes explicit Vivado concepts separate from HLS classes. |
| 2 | [#8 Add Vivado project discovery and metadata loading](https://github.com/cosgroma/vscode-vivado/issues/8) | #7 | Discovers `.xpr` projects and starts loading project metadata. |
| 3 | [#9 Render minimal Vivado project tree](https://github.com/cosgroma/vscode-vivado/issues/9) | #7, #8 | Renders source, constraint, run, and report structure from the model/discovery layer. |

### v0.5.0 Vivado Run Management

| Order | Issue | Dependencies | Notes |
| --- | --- | --- | --- |
| 1 | [#10 Add command to open a Vivado project in the GUI](https://github.com/cosgroma/vscode-vivado/issues/10) | #4, #8 | First user-facing Vivado command; validates executable and project path handling. |
| 2 | [#11 Add synthesis, implementation, and bitstream run commands](https://github.com/cosgroma/vscode-vivado/issues/11) | #5, #6, #8, #9 | Main project-mode build flow. |
| 3 | [#12 Add reset, clean, and generated TCL preview commands](https://github.com/cosgroma/vscode-vivado/issues/12) | #6, #11 | Adds safe maintenance operations once primary run commands exist. |

### v0.6.0 Diagnostics, Reports, And XSim

| Order | Issue | Dependencies | Notes |
| --- | --- | --- | --- |
| 1 | [#13 Add Vivado problem matchers and diagnostics](https://github.com/cosgroma/vscode-vivado/issues/13) | #5, #11 | Uses real command output paths and fixture logs from run management. |
| 2 | [#14 Surface Vivado report summaries in the project tree](https://github.com/cosgroma/vscode-vivado/issues/14) | #9, #11 | Needs run/report locations to be stable before summaries are surfaced. |
| 3 | [#15 Add behavioral XSim run support](https://github.com/cosgroma/vscode-vivado/issues/15) | #5, #8, #11 | Reuses execution and project metadata patterns established for build commands. |

### v0.7.0 IP, Block Designs, And Hardware

| Order | Issue | Dependencies | Notes |
| --- | --- | --- | --- |
| 1 | [#16 Show IP sources with status and maintenance actions](https://github.com/cosgroma/vscode-vivado/issues/16) | #7, #8, #9, #5, #6 | Adds IP model/tree/execution behavior after the base tree and TCL runner exist. |
| 2 | [#17 Add block design validation and output product commands](https://github.com/cosgroma/vscode-vivado/issues/17) | #7, #8, #9, #5, #6 | Parallel to IP work once project metadata and visible TCL execution are stable. |
| 3 | [#18 Add basic hardware manager and programming commands](https://github.com/cosgroma/vscode-vivado/issues/18) | #11, #16, #17 | Hardware should wait for project builds, bitstreams, IP, and block design flows to settle. |

### v1.0.0 Vivado-Ready Release

| Order | Issue | Dependencies | Notes |
| --- | --- | --- | --- |
| 1 | [#20 Stabilize HLS and Vivado coexistence](https://github.com/cosgroma/vscode-vivado/issues/20) | #7, #8, #9, v0.2.3 closed | Clean up shared UI/project behavior after both HLS and Vivado paths are visible. |
| 2 | [#21 Expand CI and tests for Vivado feature coverage](https://github.com/cosgroma/vscode-vivado/issues/21) | #22, #3-#18 | Extends coverage discipline from HLS stabilization to Vivado features. |
| 3 | [#19 Document Vivado workflows and release readiness](https://github.com/cosgroma/vscode-vivado/issues/19) | #3-#18, #20, #21 | Documentation should describe implemented behavior, not intended behavior. |

## Critical Path

The longest dependency chain is:

1. #22 coverage tooling
2. #24 model tests
3. #30 task runner tests
4. #25 project manager tests
5. #26 project tree tests
6. Close `v0.2.3 Test coverage`
7. #3 Vivado activation
8. #4 Vivado settings
9. #5 `vivadoRun`
10. #6 visible TCL
11. #7 Vivado models
12. #8 Vivado discovery
13. #9 Vivado tree
14. #11 Vivado build commands
15. #13 diagnostics and #14 reports
16. #16 IP and #17 block designs
17. #18 hardware
18. #20 coexistence
19. #21 Vivado test coverage
20. #19 release documentation

## Recommended First Sprint

Start with the smallest set that makes progress measurable:

1. #22 Add coverage tooling and enforce 100% thresholds.
2. #24 Test HLS project XML parsing and model behavior.
3. #31 Test OutputConsole singleton and channel forwarding.
4. #32 Add package contribution and docs consistency checks for claimed features.
5. #30 Test `vitisRun` task creation and cleanup.

This creates the coverage gate, proves the fixture/stubbing approach, and unlocks
the larger command, manager, and tree-provider test issues.

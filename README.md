# VS Code Vivado

VS Code Vivado is a [Visual Studio Code](https://code.visualstudio.com/)
extension for AMD/Xilinx FPGA development. The long-term goal is to make VS
Code a practical cockpit for Vivado projects: project discovery, source and
constraint navigation, TCL-backed build tasks, diagnostics, reports, simulation,
IP and block design workflows, and eventually hardware programming.

The current codebase began as a Vitis HLS extension. HLS support is still part
of the project and will not be removed. Existing HLS workflows will continue to
receive compatibility, test coverage, and maintenance work. The primary product
focus going forward is Vivado-centered FPGA development, with HLS support kept
available for projects that use Vitis HLS directly or feed generated IP into
Vivado.

## Current HLS Support

See [Features](docs/features.md) and [Getting Started](docs/getting-started.md)
for the current user-facing workflows.

- Discover and manage multiple Vitis HLS projects from one workspace.
- Browse HLS source files, test bench files, and solutions in the project tree.
- Run C simulation.
- Launch C simulation debug sessions.
- Run C synthesis.
- Run C/RTL cosimulation.
- Add and remove source and test bench files.

## Current Vivado Support

- Discover Vivado projects from `.xpr` files.
- Browse Vivado design sources, simulation sources, constraints, runs, and reports.
- Open a project in the Vivado IDE.
- Run synthesis, implementation, and bitstream generation as TCL-backed VS Code
  tasks.
- Surface file-backed Vivado task diagnostics in Problems when Vivado emits
  file and line locations.
- Preview generated TCL without executing Vivado.
- Reset selected synthesis or implementation runs.
- Clean generated outputs for selected synthesis or implementation runs.

## Vivado Direction

Planned Vivado work is tracked in GitHub issues and milestones. See the
[Vivado Roadmap](docs/roadmap.md) and
[Issue Dependency Plan](docs/issue-dependency-plan.md) for the full development
path. The intended direction is:

- Build on `.xpr` activation and Vivado settings with a reusable `vivadoRun`
  helper.
- Introduce explicit Vivado project models instead of forcing Vivado concepts
  into the inherited HLS model.
- Render a Vivado project tree for design sources, simulation sources,
  constraints, runs, reports, IP, block designs, TCL scripts, and hardware.
- Run Vivado tasks through visible, reproducible TCL.
- Extend Vivado diagnostics and report summaries inside VS Code.
- Add XSim, IP, block design, and hardware manager workflows after the project
  foundation is reliable.

## Requirements

For setup details, see [Getting Started](docs/getting-started.md).

- [Vitis and Vitis HLS](https://www.xilinx.com/support/download.html)
- [Vivado](https://www.xilinx.com/support/download.html)
- The Microsoft C/C++ extension when using C simulation debugging

## Extension Settings

This extension currently contributes these settings. See
[Settings](docs/settings.md) for more detail.

- `vitis-hls-ide.vitisPath`: path to the Vitis installation directory.
- `vitis-hls-ide.hlsPath`: path to the Vitis HLS installation directory.
- `vscode-vivado.vivadoPath`: path to the Vivado installation directory.
- `vscode-vivado.vivadoExecutablePath`: optional Vivado executable path or
  command name.
- `vscode-vivado.vivadoSettingsScript`: optional Vivado environment setup
  script.
- `vscode-vivado.projectSearchGlobs`: workspace globs for Vivado project
  discovery.
- `vscode-vivado.reportsDirectory`: default report artifact directory.
- `vscode-vivado.generatedTclDirectory`: default generated TCL script
  directory.
- `vscode-vivado.preserveRunLogs`: whether Vivado task logs should be kept.

## Development

Development is organized through GitHub milestones. See
[Development](docs/development.md), [Testing](docs/testing.md), and the
[Issue Dependency Plan](docs/issue-dependency-plan.md) for contributor workflow,
test expectations, and issue ordering.

- `v0.2.3 Test coverage`: stabilize and fully cover the current HLS baseline.
- `v0.3.0 Vivado foundation`: activation, settings, and TCL-backed execution.
- `v0.4.0 Vivado project model and tree`: Vivado models, discovery, and UI.
- `v0.5.0 Vivado run management`: synthesis, implementation, bitstream, and
  maintenance commands.
- `v0.6.0 Diagnostics, reports, and XSim`: diagnostics, report summaries, and
  simulation.
- `v0.7.0 IP, block designs, and hardware`: IP, block design, and hardware
  workflows.
- `v1.0.0 Vivado-ready release`: documentation, test coverage, and release
  readiness.

## Further Reading

- [Documentation Home](docs/index.md)
- [Getting Started](docs/getting-started.md)
- [Features](docs/features.md)
- [Settings](docs/settings.md)
- [Vivado Roadmap](docs/roadmap.md)
- [Issue Dependency Plan](docs/issue-dependency-plan.md)
- [Testing](docs/testing.md)
- [Development](docs/development.md)
- [VS Code Extension References](docs/references-vscode.md)
- [Vivado References](docs/references-vivado.md)

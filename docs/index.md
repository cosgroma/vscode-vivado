# VS Code Vivado

VS Code Vivado is a Visual Studio Code extension project for bringing AMD Vivado workflows into the editor.

The repository currently contains an inherited Vitis HLS extension baseline. That baseline discovers `hls.app` project files and provides project tree actions for source files, test bench files, C simulation, C synthesis, and C/RTL cosimulation.

The direction for this repository is broader Vivado project support: discovering Vivado projects, surfacing design sources and constraints, running common Vivado flows, and making project state visible inside VS Code.

!!! warning
    The current implementation is still Vitis HLS-oriented. The Vivado support described in these docs is the desired direction unless a section is explicitly marked as current behavior.

## Current Baseline

- Discover Vitis HLS projects in a VS Code workspace.
- Browse source and test bench files from the Projects tree.
- Add and remove source and test bench files.
- Run C simulation setup and launch the generated binary in the C++ debugger.
- Run C synthesis.
- Run C/RTL cosimulation.
- Surface C simulation diagnostics through the contributed problem matcher.

## Desired Vivado Support

- Discover Vivado projects from `.xpr` files.
- Show RTL sources, block designs, constraints, simulation sources, IP, and generated outputs.
- Run synthesis, implementation, bitstream generation, simulation, and reports from VS Code tasks.
- Parse Vivado diagnostics and link messages back to source files.
- Support TCL-first automation so the extension can mirror reproducible command-line flows.
- Keep Vitis HLS support available where it helps FPGA projects that use both HLS and Vivado.

## Documentation Map

- [Getting Started](getting-started.md): install requirements and open a compatible workspace.
- [Features](features.md): current behavior and planned Vivado features.
- [Vivado Roadmap](roadmap.md): desired to-be support for Vivado projects.
- [Settings](settings.md): extension configuration keys.
- [Development](development.md): build and run the extension locally.
- [Testing](testing.md): run the current test suite and planned coverage areas.
- [VS Code Extension References](references-vscode.md): extension anatomy, contribution points, activation, and UI/workflow surfaces.
- [Vivado References](references-vivado.md): AMD Vivado documentation and local tool notes.

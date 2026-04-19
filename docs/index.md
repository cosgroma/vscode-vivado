# VS Code Vivado

VS Code Vivado is a Visual Studio Code extension project for bringing AMD Vivado workflows into the editor.

The repository started from an inherited Vitis HLS extension baseline. That baseline discovers `hls.app` project files and provides project tree actions for source files, test bench files, C simulation, C synthesis, and C/RTL cosimulation.

The current Vivado workflow discovers `.xpr` projects, surfaces sources, constraints, runs, and reports, and runs project-mode build and maintenance actions through visible TCL.

!!! warning
    Some Vivado sections describe the desired direction for future milestones. Sections marked as current behavior describe the shipped extension surface.

## Current Support

- Discover Vitis HLS projects in a VS Code workspace.
- Browse source and test bench files from the Projects tree.
- Add and remove source and test bench files.
- Run C simulation setup and launch the generated binary in the C++ debugger.
- Run C synthesis.
- Run C/RTL cosimulation.
- Surface C simulation diagnostics through the contributed problem matcher.
- Discover Vivado projects from `.xpr` files.
- Browse Vivado design sources, simulation sources, constraints, runs, and reports.
- Open Vivado projects in the Vivado IDE.
- Run synthesis, implementation, and bitstream generation through visible TCL-backed tasks.
- Preview generated TCL without executing Vivado.
- Reset selected Vivado synthesis or implementation runs.
- Clean generated outputs for selected Vivado synthesis or implementation runs.

## Desired Vivado Support

- Show RTL sources, block designs, constraints, simulation sources, IP, and generated outputs.
- Run simulation and report-generation flows from VS Code tasks.
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

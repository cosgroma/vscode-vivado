# Getting Started

## Project Status

This repository is moving toward Vivado project support. The implementation currently activates around Vitis HLS project files, so the usage instructions are split into current behavior and intended Vivado behavior.

## Requirements

Install these tools before using the extension:

- Visual Studio Code `1.90.0` or newer.
- AMD Vivado for the target to-be workflow.
- AMD Vitis and Vitis HLS for the current inherited HLS workflow.
- Microsoft C/C++ extension for VS Code (`ms-vscode.cpptools`).

The extension declares `ms-vscode.cpptools` as an extension dependency, so VS Code should install it when the extension is installed.

## Current Workflow

Open a VS Code workspace that contains one or more Vitis HLS project files named `hls.app`.

The extension activates when VS Code finds an `hls.app` file in the workspace.
After activation, the Vitis HLS IDE activity bar view contains the Projects
tree.

## Target Vivado Workflow

The desired workflow is to open a VS Code workspace that contains one or more
Vivado project files with the `.xpr` extension.

The extension should then activate, discover Vivado projects, and show a Vivado-focused project tree with:

- Design sources.
- Simulation sources.
- Constraint files.
- IP and block design files.
- Runs for synthesis, implementation, and bitstream generation.
- Reports and generated artifacts.

The extension now activates for `.xpr` workspaces and contributes Vivado
settings. Vivado project discovery and tree behavior are still under
development, so use the current Vitis HLS workflow for the project tree and run
commands that exist today.

## Configure Tool Paths Today

Open VS Code settings and configure:

- `vitis-hls-ide.vitisPath`
- `vitis-hls-ide.hlsPath`
- `vscode-vivado.vivadoPath`
- `vscode-vivado.vivadoExecutablePath`
- `vscode-vivado.vivadoSettingsScript`
- `vscode-vivado.generatedTclDirectory`

The default Windows paths are:

```text
C:\Xilinx\Vitis\2023.2
C:\Xilinx\Vitis_HLS\2023.2
C:\Xilinx\Vivado\2023.2
```

The Vivado executable setting can be a full path or a command name such as
`vivado` when the command is already available on `PATH`.

Generated Vivado TCL scripts are written to `.vscode-vivado/tcl` by default.
Each script includes the task name, working directory, and the command needed to
rerun the same script manually from a terminal or CI job.

## C++ Include Path

On activation, the extension checks `.vscode/c_cpp_properties.json` in the first workspace folder. If the Vitis HLS include path is missing, it can add the configured HLS include path to each C++ configuration.

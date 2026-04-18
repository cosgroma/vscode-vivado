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

The extension activates when VS Code finds an `hls.app` file in the workspace. After activation, the Vitis HLS IDE activity bar view contains the Projects tree.

## Target Vivado Workflow

The desired workflow is to open a VS Code workspace that contains one or more Vivado project files named `.xpr`.

The extension should then activate, discover Vivado projects, and show a Vivado-focused project tree with:

- Design sources.
- Simulation sources.
- Constraint files.
- IP and block design files.
- Runs for synthesis, implementation, and bitstream generation.
- Reports and generated artifacts.

Until `.xpr` activation and parsing are implemented, use the current Vitis HLS workflow for the behavior that exists today.

## Configure Tool Paths Today

Open VS Code settings and configure:

- `vitis-hls-ide.vitisPath`
- `vitis-hls-ide.hlsPath`

The default Windows paths are:

```text
C:\Xilinx\Vitis\2023.2
C:\Xilinx\Vitis_HLS\2023.2
```

## Desired Vivado Settings

Vivado support should introduce settings for:

- The Vivado installation path.
- The preferred Vivado executable or `vivado` command path.
- Default TCL batch mode behavior.
- Optional workspace-specific project discovery globs.
- Optional output locations for reports and generated task logs.

## C++ Include Path

On activation, the extension checks `.vscode/c_cpp_properties.json` in the first workspace folder. If the Vitis HLS include path is missing, it can add the configured HLS include path to each C++ configuration.

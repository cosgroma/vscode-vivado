# Settings

The current implementation contributes settings under `vitis-hls-ide`. Future Vivado support should add Vivado-specific settings rather than overloading the HLS settings.

## Current HLS Settings

## `vitis-hls-ide.vitisPath`

Path to the Vitis installation directory.

Default:

```text
C:\Xilinx\Vitis\2023.2
```

This path is used to add Vitis executables to the task environment when running `vitis-run`.

## `vitis-hls-ide.hlsPath`

Path to the Vitis HLS installation directory.

Default:

```text
C:\Xilinx\Vitis_HLS\2023.2
```

This path is used for:

- C++ include path checks.
- The GDB path used by the C simulation debug launch configuration.

## To-Be Vivado Settings

Vivado support should add settings similar to:

### `vscode-vivado.vivadoPath`

Path to the Vivado installation directory or the directory that contains the `vivado` executable.

Example:

```text
C:\Xilinx\Vivado\2023.2
```

### `vscode-vivado.projectSearchGlobs`

Workspace globs used to discover Vivado projects.

Example:

```json
[
  "**/*.xpr"
]
```

### `vscode-vivado.tclBatchMode`

Default behavior for commands that run Vivado TCL in batch mode.

### `vscode-vivado.reportsDirectory`

Optional workspace-relative directory for generated or copied report artifacts.

### `vscode-vivado.preserveRunLogs`

Whether logs from synthesis, implementation, bitstream, and simulation tasks should be kept after task completion.

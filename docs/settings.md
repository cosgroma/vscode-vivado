# Settings

The extension keeps inherited Vitis HLS settings under `vitis-hls-ide` and
adds Vivado-specific settings under `vscode-vivado`.

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

## Vivado Settings

## `vscode-vivado.vivadoPath`

Path to the Vivado installation directory. When
`vscode-vivado.vivadoExecutablePath` is empty, the extension resolves the
Vivado executable from this path.

Default:

```text
C:\Xilinx\Vivado\2023.2
```

## `vscode-vivado.vivadoExecutablePath`

Optional full path to the Vivado executable, or a command name available on
`PATH`.

Default: empty string.

When this setting is empty, the extension derives the executable from
`vscode-vivado.vivadoPath`, using `bin\vivado.bat` on Windows and `bin/vivado`
on Linux/macOS.

## `vscode-vivado.vivadoSettingsScript`

Optional path to a Vivado environment setup script, such as `settings64.bat` on
Windows or `settings64.sh` on Linux.

Default: empty string.

Vivado GUI and task helpers use this when Vivado is not already available on
`PATH` or when the environment must be initialized before launch.

## `vscode-vivado.projectSearchGlobs`

Workspace globs used to discover Vivado projects.

Default:

```json
[
  "**/*.xpr"
]
```

## `vscode-vivado.reportsDirectory`

Optional workspace-relative directory for generated or copied report artifacts.

Default:

```text
reports
```

## `vscode-vivado.generatedTclDirectory`

Workspace-relative directory for generated Vivado TCL scripts. Absolute paths
are also supported.

Default:

```text
.vscode-vivado/tcl
```

Extension-driven Vivado actions write the exact TCL they execute into this
directory. Generated scripts include a short header with the task name, working
directory, and copyable rerun command.

## `vscode-vivado.preserveRunLogs`

Whether logs from synthesis, implementation, bitstream, and simulation tasks should be kept after task completion.

Default:

```text
true
```

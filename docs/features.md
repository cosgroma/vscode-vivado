# Features

## Current HLS Features

The current implementation is inherited from a Vitis HLS extension. These features describe what exists today.

### Project Discovery

The extension searches for `hls.app` files in the active workspace and builds the Projects tree from those project files.

Each project node contains:

- `Source`
- `Test Bench`
- One node per HLS solution

Each solution contains run controls for:

- C simulation
- C synthesis
- C/RTL cosimulation

### Source And Test Bench Files

Use the context actions in the Projects tree to add or remove files.

Add actions open a file picker for C++ source and header files:

- `.cpp`
- `.h`
- `.hpp`

Remove actions update the project file but do not delete the original file from disk.

### C Simulation

The C simulation action runs Vitis HLS with TCL that opens the project, opens the selected solution, and runs:

```tcl
csim_design -setup
```

If the setup task succeeds, the extension launches the generated `csim.exe` through the C++ debugger.

### C Synthesis

The C synthesis action runs:

```tcl
csynth_design
```

After the task ends, the extension reads the solution log and writes it to the Vitis HLS IDE output channel.

### C/RTL Cosimulation

The cosimulation action runs:

```tcl
cosim_design
```

After the task ends, the extension reads the solution log and writes it to the Vitis HLS IDE output channel.

### Refresh

Use the refresh action in the Projects view title to rescan the workspace for
`hls.app` and `.xpr` files and reload project state.

## Current Vivado Features

### Vivado Project Discovery

The extension activates for workspaces that contain `.xpr` files and discovers
Vivado projects using `vscode-vivado.projectSearchGlobs`.

### Vivado Project Tree

Vivado projects render separately from HLS projects in the Projects tree. Each
Vivado project contains:

- `Design Sources`
- `Simulation Sources`
- `Constraints`
- `Runs`
- `Reports`

Empty categories remain visible and expand to no children.

### Open In Vivado

Use the `Open in Vivado` context action on a Vivado project node to launch the
Vivado IDE for that `.xpr` project. The command generates a visible TCL script
that runs `open_project`, starts Vivado from the project directory, and uses the
configured `vscode-vivado.vivadoPath`,
`vscode-vivado.vivadoExecutablePath`, and
`vscode-vivado.vivadoSettingsScript` settings.

### Run Synthesis

Use the `Run Synthesis` context action on a Vivado project node or synthesis run
node to launch the selected project-mode synthesis run as a VS Code task. The
command generates visible TCL that opens the `.xpr`, calls `launch_runs`, waits
for the run, and checks that Vivado reports `PROGRESS` as `100%`.

## Planned Vivado Features

The extension should grow from HLS project management into Vivado project support. The desired Vivado features are listed here as the product target.

For the implementation sequence and deeper feature plan, see the [Vivado Roadmap](roadmap.md).

### Expanded Source Tree

Expand Vivado project contents in a tree that matches how FPGA engineers think
about the project:

- RTL design sources.
- Simulation sources.
- Constraint files.
- IP cores.
- Block designs.
- Memory initialization files.
- TCL scripts.
- Reports and generated outputs.

### Run Management

Expose common Vivado runs as VS Code commands and tasks:

- Elaborate design.
- Run behavioral simulation.
- Run implementation.
- Generate bitstream.
- Open timing, utilization, DRC, and power reports.

The extension should use Vivado TCL under the hood so every action can be reproduced outside VS Code.

### Diagnostics

Parse Vivado messages from task output and report files. Diagnostics should link warnings and errors back to source files where possible.

### TCL Workflow

Support project-based and script-based flows. Users should be able to run
checked-in TCL scripts, generate project summaries, and inspect the exact
commands issued by the extension.

### HLS And Vivado Together

Vitis HLS support can remain useful for projects that generate IP for Vivado. The long-term goal is to make HLS projects and Vivado projects visible together without making either workflow feel bolted on.

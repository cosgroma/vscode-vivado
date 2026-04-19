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

### Run Implementation

Use the `Run Implementation` context action on a Vivado project node or
implementation run node to launch the selected project-mode implementation run
as a VS Code task. The command generates visible TCL that opens the `.xpr`,
calls `launch_runs`, waits for the run, and checks that Vivado reports
`PROGRESS` as `100%`.

### Generate Bitstream

Use the `Generate Bitstream` context action on a Vivado project node or
implementation run node to launch bitstream generation through the selected
project-mode implementation run. The command generates visible TCL that opens
the `.xpr`, calls `launch_runs -to_step write_bitstream`, waits for the run,
and checks that Vivado reports `PROGRESS` as `100%`.

### Run Behavioral Simulation

Use the `Run Behavioral Simulation` context action on a Vivado project node or
simulation source file to launch project-mode XSim as a VS Code task. Project
targets use the `sim_1` simulation fileset when it exists, then fall back to the
first simulation fileset. Simulation source file targets use the file's
associated simulation fileset.

The command generates visible TCL that opens the `.xpr`, selects the simulation
fileset, calls `launch_simulation -mode behavioral`, and runs the simulation
with `run all`. Simulation output stays in the task terminal, and the task can
be canceled through VS Code's normal task controls.

### Preview Generated TCL

Use the `Preview Generated TCL` context action on a Vivado project node,
synthesis run node, or implementation run node to inspect extension-generated
TCL without launching Vivado. Project-level previews offer the build actions
available for the project. Run-level previews also include run maintenance
actions that are valid for that run.

Preview documents are untitled TCL documents. They include a preview-only
header, the selected project and run, and a destructive marker for reset and
clean actions.

### Reset Run

Use the `Reset Run` context action on a synthesis or implementation run node to
reset that selected Vivado run. The command requires modal confirmation before
generating TCL or launching Vivado, rejects project-only targets, and refuses to
start while another Vivado task is active.

The generated TCL opens the `.xpr`, resolves the selected run with `get_runs`,
calls `reset_runs`, and closes the project.

### Clean Run Outputs

Use the `Clean Run Outputs` context action on a synthesis or implementation run
node to reset the selected run and delete only the Vivado-reported run output
directory. The command requires modal confirmation before generating TCL or
launching Vivado, rejects project-only targets, and refuses to start while
another Vivado task is active.

Before deleting anything, the generated TCL reads the run `DIRECTORY` property,
normalizes it, rejects empty paths, rejects the project root, and rejects paths
outside the project root.

### Vivado Diagnostics

Vivado tasks use a contributed problem matcher for file-backed `ERROR`,
`WARNING`, `CRITICAL WARNING`, and `INFO` messages that end with
`[file:line]` or `[file:line:column]`. Matching messages appear in Problems and
link back to the emitted file location.

Messages without usable file and line data remain in the task terminal and
generated logs so they can still be searched and copied.

### Vivado Report Summaries

The Reports tree links discovered `.rpt` files from the configured
`vscode-vivado.reportsDirectory` location and from Vivado run output
directories such as `<project>.runs/<run>`. Report nodes open the raw report
file.

Timing, utilization, DRC, methodology, and power reports show best-effort
summaries when the extension can parse common Vivado report text. Missing
reports or unrecognized report formats leave the report node openable without a
summary instead of breaking the tree.

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
- Add post-synthesis and post-implementation simulation.
- Open timing, utilization, DRC, and power reports.

The extension should use Vivado TCL under the hood so every action can be reproduced outside VS Code.

### Generated Report Workflows

Add commands for generating timing, utilization, DRC, methodology, and power
reports directly from VS Code, and extend parser coverage for richer report
diagnostics.

### TCL Workflow

Support project-based and script-based flows. Users should be able to run
checked-in TCL scripts and generate project summaries.

### HLS And Vivado Together

Vitis HLS support can remain useful for projects that generate IP for Vivado. The long-term goal is to make HLS projects and Vivado projects visible together without making either workflow feel bolted on.

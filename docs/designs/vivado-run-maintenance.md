# Vivado Run Maintenance Design

This design scopes issue
[#12 Add reset, clean, and generated TCL preview commands](https://github.com/cosgroma/vscode-vivado/issues/12).
It depends on the run-command contract from issue #11 and should land in small
implementation pull requests after this design is reviewed.

## Goals

- Let users inspect generated TCL for supported Vivado actions before Vivado is
  launched.
- Add explicit run maintenance commands for selected synthesis and
  implementation runs.
- Keep reset and clean operations scoped to one selected run.
- Make destructive behavior visible through generated TCL, modal confirmation,
  and tests.
- Preserve current HLS workflows and command registrations.

## Non-Goals

- Do not add reset, clean, or preview actions to HLS project items.
- Do not delete Vivado run objects from the project.
- Do not add a project-wide clean command.
- Do not reset parent or downstream runs implicitly beyond what Vivado itself
  requires for the selected command.
- Do not add report parsing, diagnostics, or XSim behavior in this issue.

## Vivado Behavior Notes

AMD documents `reset_runs` as the project-mode Tcl command for resetting
existing runs. AMD also documents that the Vivado IDE reset flow prompts before
resetting a run and can optionally delete generated files from the run
directory.

UG835 documents `delete_runs` as a command that removes run objects from the
project and optionally removes run results. This issue should not use
`delete_runs`, because the user asked for run maintenance, not run removal.

UG835 also documents `reset_project` for cleaning project-level outputs and
resetting project state. This issue should not use `reset_project`, because the
acceptance criteria require commands to avoid unrelated project state changes.

The current AMD Tcl command reference does not document a run-preserving
`clean_run` command. This design therefore treats `Clean Run Outputs` as an
extension-owned guarded operation: reset the selected run with `reset_runs`,
then remove only the run directory reported by Vivado after path safety checks.
That is an implementation inference from the documented reset/delete/project
commands, not an AMD-provided single Tcl command.

## User Surface

Add three commands:

| Command ID | Title | Primary Target |
| --- | --- | --- |
| `vscode-vivado.projects.previewGeneratedTcl` | `Preview Generated TCL` | Vivado project or run |
| `vscode-vivado.projects.resetRun` | `Reset Run` | Vivado synthesis or implementation run |
| `vscode-vivado.projects.cleanRunOutputs` | `Clean Run Outputs` | Vivado synthesis or implementation run |

The commands should be contributed to `commandPalette` with `when: false`,
matching the current tree-command pattern. Context menu entries should appear
only in the Projects view:

- `vivadoProjectItem`: show `Preview Generated TCL`.
- `vivadoSynthesisRunItem`: show `Preview Generated TCL`, `Reset Run`, and
  `Clean Run Outputs`.
- `vivadoImplementationRunItem`: show `Preview Generated TCL`, `Reset Run`,
  and `Clean Run Outputs`.
- file, report, category, and HLS tree items: show none of these commands.

`Reset Run` and `Clean Run Outputs` must require an explicit run item. If invoked
without a run item, show an actionable error and do not generate TCL.

## Shared TCL Action Registry

The current run commands each define an action name, task name, run type,
default run name, and `buildTcl` function. Issue #12 should formalize that shape
into a shared `VivadoTclActionDefinition` registry.

Each action definition should include:

- stable action ID.
- user-facing title.
- optional task action name for commands that execute Vivado.
- supported target type: project default run, explicit run, or both.
- supported run type, when the action is run-scoped.
- `buildTcl(project, run)` function.
- destructive flag for confirmation and preview labeling.

The registry should initially contain:

- `Run Synthesis`
- `Run Implementation`
- `Generate Bitstream`
- `Reset Run`
- `Clean Run Outputs`

This keeps preview behavior tied to the same TCL builders used for execution.
The preview command should not duplicate TCL strings.

## Preview Generated TCL

`Preview Generated TCL` should not run Vivado, write a generated script file, or
refresh project state.

Target handling:

- Project target: offer actions that can resolve a default run from the project:
  `Run Synthesis`, `Run Implementation`, and `Generate Bitstream`.
- Synthesis run target: offer `Run Synthesis`, `Reset Run`, and
  `Clean Run Outputs`.
- Implementation run target: offer `Run Implementation`, `Generate Bitstream`,
  `Reset Run`, and `Clean Run Outputs`.

When more than one action is valid, show a quick pick with action titles. If no
action is valid, show an error and do not open a preview.

Open the preview as an untitled TCL document using
`vscode.workspace.openTextDocument({ language: 'tcl', content })`. The buffer is
a disposable copy; edits to it must never affect execution unless the user saves
and runs it outside the extension.

Preview content should use the same body builder as execution and add a short
header:

```tcl
# Generated by VS Code Vivado.
# Preview only. This script has not been executed.
# Action: Reset Run
# Project: demo
# Run: synth_1

open_project "C:/work/demo/demo.xpr"
reset_runs "synth_1"
close_project
```

Execution scripts written by `vivadoRun(...)` should keep their existing
generated-file metadata and rerun command. The preview header should not claim a
generated file path or rerun command that does not exist yet.

## Reset Run

`Reset Run` should accept only an explicit `VivadoRunTreeItem` or a test target
with `{ project, run }`. It should reject project-only targets so the command
never guesses which run to reset.

Before generating TCL, reject concurrent Vivado tasks using the existing
`vivadoTaskSource` guard. HLS task behavior should remain unchanged.

Before execution, show a modal confirmation:

```text
Reset Vivado run "synth_1" in "demo"? This resets the run state and may invalidate downstream results.
```

The confirmation button should be `Reset Run`. Canceling should return without
generating TCL or starting Vivado.

TCL contract:

```tcl
open_project "<project.xpr>"
set selected_run [get_runs "<run>"]
if {[llength $selected_run] != 1} {
    error "Expected exactly one Vivado run named <run>"
}
reset_runs $selected_run
close_project
```

On exit code `0`, show a concise success message and refresh Vivado projects. On
nonzero exit, show a failure message that points to the Vivado task output and
generated TCL script. On `undefined`, treat the command as canceled or
unavailable and avoid success messaging.

## Clean Run Outputs

`Clean Run Outputs` should also require an explicit run target and modal
confirmation. The command is stronger than reset because it deletes files, so
the prompt must name the run and explain the deletion scope:

```text
Clean generated outputs for Vivado run "synth_1" in "demo"? This resets the run and deletes only the Vivado-reported run directory after path guards pass.
```

The confirmation button should be `Clean Run Outputs`. Canceling should return
without generating TCL or starting Vivado.

TCL contract:

```tcl
open_project "<project.xpr>"
set selected_run [get_runs "<run>"]
if {[llength $selected_run] != 1} {
    error "Expected exactly one Vivado run named <run>"
}

set project_root [file normalize "<project root>"]
set run_dir [file normalize [get_property DIRECTORY $selected_run]]

if {$run_dir eq ""} {
    error "Vivado did not report a run directory for <run>"
}

if {$run_dir eq $project_root} {
    error "Refusing to delete the project root"
}

set project_parts [file split $project_root]
set run_parts [file split $run_dir]
set prefix [lrange $run_parts 0 [expr {[llength $project_parts] - 1}]]

if {[llength $run_parts] <= [llength $project_parts] || $prefix ne $project_parts} {
    error "Refusing to delete a run directory outside the project root: $run_dir"
}

reset_runs $selected_run

if {[file exists $run_dir]} {
    file delete -force -- $run_dir
}

close_project
```

The implementation should verify the `DIRECTORY` property against real Vivado
run objects before landing this slice. If the property is unavailable for a
supported Vivado version, stop and adjust the design before shipping clean.

The clean command must not:

- call `delete_runs`.
- call `reset_project`.
- delete a path outside the project root.
- delete the project root itself.
- delete source, constraint, IP, block design, or report directories directly.

## Implementation Slices

1. Preview generated TCL for existing build actions.
   - Export a shared action registry for `Run Synthesis`,
     `Run Implementation`, and `Generate Bitstream`.
   - Add `Preview Generated TCL` and package contributions.
   - Add tests proving preview opens generated TCL without calling
     `vivadoRun(...)`.
2. Reset selected runs.
   - Add `Reset Run` builder, command, confirmation, package contribution, and
     tests.
   - Reuse the active Vivado task guard and success/failure refresh behavior.
3. Clean selected run outputs.
   - Add guarded run-directory cleanup after `reset_runs`.
   - Add tests for confirmation, generated TCL, path guards, and cancellation.
4. Issue wrap-up.
   - Update issue labels and acceptance notes.
   - Revisit whether docs or command titles need adjustment after real Vivado
     smoke testing.

## Test Plan

- TCL builder tests for preview headers, reset, clean, quoted paths, and quoted
  run names.
- Target resolution tests that reject project-only reset and clean commands.
- Preview command tests that stub quick pick, document opening, and document
  display without invoking Vivado.
- Reset and clean command tests that cover confirmation accepted, confirmation
  canceled, active Vivado task rejection, nonzero exit, `undefined` exit, and
  successful refresh.
- Package contribution tests for command IDs, hidden command palette entries,
  and tree menu visibility.
- Existing HLS command and tree tests must continue to pass.

## References

- AMD UG835:
  [`reset_runs`](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/reset_runs)
- AMD UG835:
  [`get_runs`](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/get_runs)
- AMD UG835:
  [`get_property`](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/get_property)
- AMD UG835:
  [`delete_runs`](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/delete_runs)
- AMD UG835:
  [`reset_project`](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/reset_project)
- AMD UG904:
  [Resetting Runs](https://docs.amd.com/r/en-US/ug904-vivado-implementation/Resetting-Runs)
- AMD UG904:
  [Canceling or Resetting the Run](https://docs.amd.com/r/en-US/ug904-vivado-implementation/Canceling-or-Resetting-the-Run)

# Vivado Run Commands Design

This design scopes issue
[#11 Add synthesis, implementation, and bitstream run commands](https://github.com/cosgroma/vscode-vivado/issues/11).
It is a design slice only. The feature should land in small implementation
pull requests after this contract is reviewed.

## Goals

- Add VS Code commands for the core Vivado project-mode build flow:
  synthesis, implementation, and bitstream generation.
- Drive Vivado through generated TCL passed to the existing `vivadoRun(...)`
  task helper.
- Keep the generated TCL visible, reproducible, and easy to rerun outside
  VS Code.
- Route task output and failures through the existing Vivado task/output path.
- Preserve all current HLS project behavior and command registrations.

## Non-Goals

- Do not reset runs, clean run directories, change strategies, or force stale
  project state. Those behaviors belong to issue #12.
- Do not create new Vivado runs implicitly. The first implementation should
  target runs already discovered from the `.xpr`.
- Do not add report parsing, problem matchers, or diagnostics in this issue.
  Those belong to issues #13 and #14.
- Do not replace project-mode Vivado runs with hand-written non-project
  synthesis, implementation, or bitstream commands.

## User Surface

Add three commands:

| Command ID | Title | Primary Target |
| --- | --- | --- |
| `vscode-vivado.projects.runSynthesis` | `Run Synthesis` | Vivado project or synthesis run |
| `vscode-vivado.projects.runImplementation` | `Run Implementation` | Vivado project or implementation run |
| `vscode-vivado.projects.generateBitstream` | `Generate Bitstream` | Vivado project or implementation run |

The commands should be contributed to `commandPalette` with `when: false`,
matching the current tree-command pattern. Context menu entries should appear
only in the Projects view:

- `vivadoProjectItem`: show all three commands.
- synthesis run item: show `Run Synthesis`.
- implementation run item: show `Run Implementation` and `Generate Bitstream`.
- file, report, category, and HLS tree items: show none of these commands.

The current `VivadoRunTreeItem` only stores a `VivadoRun`. Run-level commands
will need the owning `VivadoProject`, so the tree implementation should pass the
project into `VivadoRunsItem` and `VivadoRunTreeItem` without changing HLS tree
items.

## Run Selection

Each command should accept either a `VivadoProjectTreeItem`, a
`VivadoRunTreeItem`, or a raw `VivadoProject` in tests. Command resolution
should normalize the argument into `{ project, run }`.

Project-level commands should choose a default run from the discovered model:

- synthesis: prefer a synthesis run named `synth_1`; otherwise use the first
  synthesis run in sorted order.
- implementation and bitstream: prefer an implementation run named `impl_1`;
  otherwise use the first implementation run in sorted order.

If the project has no compatible run, show an actionable error message and do
not generate TCL. The command should not guess a run name that is absent from
the project model.

Run-level commands should validate the run type:

- `Run Synthesis` accepts only synthesis runs.
- `Run Implementation` accepts only implementation runs.
- `Generate Bitstream` accepts only implementation runs.

## TCL Contract

Vivado project-mode execution should follow AMD's documented run model:
`open_project` opens a `.xpr`, `launch_runs` launches existing synthesis or
implementation runs, `wait_on_run` waits for completion, and `get_runs` exposes
run state such as `PROGRESS`.

The implementation should use a shared TCL quoting helper. The existing
`open-project` command has a private `quoteTclString`; before adding more
Vivado commands, move that behavior to a shared utility and test Windows paths,
dollar signs, quotes, brackets, and newlines.

### Synthesis

```tcl
open_project "<project.xpr>"
launch_runs "<synth_run>"
wait_on_run "<synth_run>"
if {[get_property PROGRESS [get_runs "<synth_run>"]] != "100%"} {
    error "Synthesis run <synth_run> did not complete"
}
close_project
```

### Implementation

```tcl
open_project "<project.xpr>"
launch_runs "<impl_run>"
wait_on_run "<impl_run>"
if {[get_property PROGRESS [get_runs "<impl_run>"]] != "100%"} {
    error "Implementation run <impl_run> did not complete"
}
close_project
```

### Bitstream

```tcl
open_project "<project.xpr>"
launch_runs "<impl_run>" -to_step write_bitstream
wait_on_run "<impl_run>"
if {[get_property PROGRESS [get_runs "<impl_run>"]] != "100%"} {
    error "Bitstream run <impl_run> did not complete"
}
close_project
```

Do not pass `-force` in the first implementation. If Vivado reports stale
constraints, incomplete parent synthesis, locked files, or other project
preconditions, surface the Vivado failure instead of hiding it.

The first implementation should omit a job-count setting and rely on Vivado's
default. A future setting such as `vscode-vivado.vivadoJobs` can be added after
the basic command behavior is stable.

## Task Behavior

Use `vivadoRun(project.uri, tcl, taskName, options)` for each command.

Task names should include the project, action, and run:

- `Vivado: Synthesis <project>/<run>`
- `Vivado: Implementation <project>/<run>`
- `Vivado: Bitstream <project>/<run>`

Before starting a task, reject concurrent Vivado tasks by checking active task
executions with source `vivadoTaskSource`. HLS tasks should continue to use the
existing HLS task source and behavior.

Presentation should reveal the terminal for long-running Vivado jobs. The
generated TCL path and rerun command are already logged by `vivadoRun(...)`.

On completion:

- exit code `0`: show a concise success message and refresh the Vivado project
  manager so run/report state can update.
- nonzero exit code: show a concise failure message and point the user to the
  Vivado task output and generated TCL script.
- `undefined`: treat as cancelled or unavailable and avoid success messaging.
- thrown errors: show the error message without refreshing unrelated HLS state.

## Implementation Slices

1. Shared command scaffolding and synthesis command.
   - Move TCL quoting into a shared utility.
   - Add run selection and command dependency injection.
   - Add package contribution checks and command tests for synthesis.
2. Implementation command.
   - Reuse the same scaffolding.
   - Add implementation-run validation and TCL tests.
3. Bitstream command.
   - Add the `launch_runs -to_step write_bitstream` flow.
   - Add success/failure/refresh tests.
4. Follow-up cleanup after all three commands land.
   - Update issue #11 acceptance notes and mark issue #12 ready.
   - Revisit whether a user-controlled jobs setting is warranted.

## Test Plan

- TCL builder tests for project path quoting, run-name quoting, and each flow.
- Run selection tests for project-level defaults and missing-run errors.
- Command tests that stub `vivadoRun(...)`, `showInformationMessage`,
  `showErrorMessage`, and project refresh behavior.
- Tree-provider tests that verify run items carry their owning project and
  expose type-specific context values.
- Package contribution tests that verify command IDs, hidden command palette
  entries, and tree menu visibility.
- Existing HLS command and tree tests must continue to pass.

## References

- AMD UG835:
  [`open_project`](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/open_project)
- AMD UG835:
  [`launch_runs`](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/launch_runs)
- AMD UG835:
  [`wait_on_runs`](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/wait_on_runs)
- AMD UG835:
  [`get_runs`](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/get_runs)
- AMD UG892:
  [Using Project Mode Tcl Commands](https://docs.amd.com/r/2023.2-English/ug892-vivado-design-flows-overview/Using-Project-Mode-Tcl-Commands)
- AMD UG892:
  [Creating and Managing Runs](https://docs.amd.com/r/en-US/ug892-vivado-design-flows-overview/Creating-and-Managing-Runs)

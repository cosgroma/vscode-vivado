# VS Code Extension References

This page collects the VS Code extension references that matter for `vscode-vivado`, then maps them to the extension surfaces we can use for Vivado project support.

## Key References

- [Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy): the relationship between activation events, contribution points, and runtime API calls.
- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest): the `package.json` fields VS Code reads to identify, activate, and load an extension.
- [Contribution Points](https://code.visualstudio.com/api/references/contribution-points): the static `contributes` declarations available in `package.json`.
- [Activation Events](https://code.visualstudio.com/api/references/activation-events): the events that cause an extension to activate.
- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api): the TypeScript API surface exposed through the `vscode` module.
- [Extension Capabilities Overview](https://code.visualstudio.com/api/extension-capabilities/overview): a high-level map of what extensions can add to VS Code.
- [Common Capabilities](https://code.visualstudio.com/api/extension-capabilities/common-capabilities): commands, settings, menus, state, notifications, quick picks, output channels, and progress.
- [Extending Workbench](https://code.visualstudio.com/api/extension-capabilities/extending-workbench): workbench UI integration points such as views, editors, and the status bar.
- [UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview): guidance for using VS Code UI surfaces without making the extension feel foreign.

## Extension Development Helpers

These marketplace extensions are useful references while developing this extension. They are not runtime dependencies for `vscode-vivado`.

- [VS Code Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner): Microsoft extension that discovers `.vscode-test.js`, `.vscode-test.mjs`, and `.vscode-test.cjs` configurations and lets extension authors run/debug `@vscode/test-cli` tests through VS Code's Test Explorer. This is the closest match for the current `npm test` setup.
- [Extension Manifest Editor](https://marketplace.visualstudio.com/items?itemName=ms-devlabs.extension-manifest-editor): previews extension manifest and README metadata from inside VS Code. Useful when renaming inherited Vitis HLS manifest fields and checking Marketplace-facing copy.
- [ExTester Runner](https://marketplace.visualstudio.com/items?itemName=redhat.extester-runner): runs and organizes UI tests for VS Code extensions that use ExTester / `vscode-extension-tester`. This is more relevant after the Vivado tree, command menus, and user flows need full UI-level regression tests.
- [VSIX Manifest Designer](https://marketplace.visualstudio.com/items?itemName=CodingWithCalvin.vsix-manifest-designer): a visual editor for VS Code extension manifest files. Treat it as an optional inspection aid; direct JSON review should remain the source of truth for contribution points.

For this repo, prefer the Microsoft Extension Test Runner first. The other tools are reference points for manifest review or future UI automation rather than required daily tooling.

## Extension Anatomy

A VS Code extension is mostly three pieces working together:

- `package.json` declares what the extension is, when it activates, and which static surfaces it contributes.
- `src/extension.ts` exports `activate(context)` and optional `deactivate()` functions.
- Runtime code registers commands, providers, watchers, output channels, tasks, diagnostics, and other disposables through the `vscode` API.

The current repository follows that shape:

- `package.json` declares the extension manifest, `activationEvents`, commands, settings, view container, view, menus, and problem matcher.
- `src/extension.ts` registers the Projects tree provider, command handlers, output console, project manager, and document-change listener.
- `src/views/projects-tree.ts` implements the current Tree View used by the activity bar Projects surface.

### Manifest

Every extension has a `package.json` manifest. The most important VS Code-specific fields are:

- `name` and `publisher`: together they form the extension identifier.
- `displayName`, `description`, `categories`, `keywords`, and `icon`: marketplace and UI metadata.
- `engines.vscode`: the minimum VS Code API version the extension targets.
- `main`: the compiled extension entry point.
- `activationEvents`: lazy-loading hooks such as `workspaceContains`, `onCommand`, `onLanguage`, `onView`, `onTaskType`, and `onStartupFinished`.
- `contributes`: static declarations for commands, configuration, menus, views, debuggers, languages, tasks, problem matchers, walkthroughs, and other extension points.
- `extensionDependencies` and `extensionPack`: dependencies on other extensions.
- `scripts` and `devDependencies`: build, test, lint, and packaging support.

The repo currently targets VS Code `^1.90.0`, which is newer than VS Code 1.74. For contributed commands, VS Code can activate the extension when the command is invoked, so those commands do not need explicit `onCommand:*` activation entries unless we intentionally support older VS Code versions.

### Activation

Activation events decide when extension code starts running in the Extension Host. For this project, the most relevant options are:

- `workspaceContains:**/hls.app`: current inherited Vitis HLS activation.
- `workspaceContains:**/*.xpr`: likely activation for Vivado project workspaces.
- `onView:projectsView`: activation when a contributed view is opened.
- `onCommand:vscode-vivado.someCommand`: activation for a command that is not already contributed in `contributes.commands`, or for older VS Code support.
- `onTaskType:vscode-vivado`: activation when a custom task type is needed.
- `onLanguage:verilog`, `onLanguage:systemverilog`, `onLanguage:vhdl`, or contributed language IDs: activation for language features.
- `onStartupFinished`: a low-priority fallback for background discovery that should happen after startup settles.

Prefer narrow activation. A Vivado extension should wake up when a workspace looks relevant, when the user opens the Vivado view, or when the user runs a Vivado command. Avoid broad startup activation unless there is a concrete reason.

### Runtime Entry Point

`activate(context)` is where the extension wires itself into VS Code. Common work includes:

- Create output channels, diagnostic collections, status bar items, tree providers, task providers, file watchers, and language providers.
- Register command handlers with `vscode.commands.registerCommand`.
- Read settings with `vscode.workspace.getConfiguration`.
- Start background discovery or cache loading.
- Push disposables into `context.subscriptions` so VS Code can clean them up.

`deactivate()` is optional. Use it for explicit cleanup that cannot be handled through disposables, such as stopping child processes, flushing long-lived telemetry buffers, or releasing external handles.

### Extension Host

Extension code runs in an Extension Host, separate from the main VS Code UI. That separation is why extension code should avoid long synchronous work. Vivado parsing, report indexing, and project discovery should be async, cancellable where possible, and careful with large workspaces.

## Core Building Blocks

These are the pieces most extensions use regardless of UI surface.

| Building block | Use it for | Relevant references |
| --- | --- | --- |
| Commands | User actions, internal actions, tree item clicks, menu entries, command palette actions, and command URIs. | [Commands](https://code.visualstudio.com/api/extension-guides/command), [Built-in Commands](https://code.visualstudio.com/api/references/commands) |
| Configuration | User and workspace settings such as Vivado install path, discovery globs, and default run behavior. | [Common Capabilities](https://code.visualstudio.com/api/extension-capabilities/common-capabilities), [configuration contribution point](https://code.visualstudio.com/api/references/contribution-points#contributes.configuration) |
| Menus and when clauses | Command Palette entries, view title buttons, tree item context actions, editor/context menus, and conditional visibility. | [menus contribution point](https://code.visualstudio.com/api/references/contribution-points#contributes.menus), [When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts) |
| Keybindings | Optional shortcuts for high-frequency commands. | [keybindings contribution point](https://code.visualstudio.com/api/references/contribution-points#contributes.keybindings) |
| State and secrets | Workspace caches, global preferences, recently opened projects, and sensitive values. | [Common Capabilities](https://code.visualstudio.com/api/extension-capabilities/common-capabilities) |
| Output channels | Logs from Vivado, Vitis HLS, generated TCL, parsing, and background discovery. | [Common Capabilities](https://code.visualstudio.com/api/extension-capabilities/common-capabilities) |
| Progress and notifications | Long-running flows, non-blocking status, warnings, and actionable errors. | [Common Capabilities](https://code.visualstudio.com/api/extension-capabilities/common-capabilities), [Notifications UX](https://code.visualstudio.com/api/ux-guidelines/notifications) |
| Quick Pick and file picker | Project selection, run selection, report selection, and adding source files. | [Common Capabilities](https://code.visualstudio.com/api/extension-capabilities/common-capabilities), [Quick Picks UX](https://code.visualstudio.com/api/ux-guidelines/quick-picks) |
| Workspace file APIs | Read/write files, create file watchers, and support remote-capable file access. | [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api) |
| Diagnostics | Problems tied to source locations, usually parsed from compiler, simulator, synthesis, or lint output. | [DiagnosticCollection API](https://code.visualstudio.com/api/references/vscode-api#DiagnosticCollection) |
| Problem matchers | Task-output parsing declared in `package.json`. | [problemMatchers contribution point](https://code.visualstudio.com/api/references/contribution-points#contributes.problemMatchers) |

## Workbench And UI Surfaces

VS Code has several places an extension can contribute UI. The best extension usually starts with native surfaces and only moves to webviews when the native APIs cannot express the workflow.

### Command Palette

The Command Palette is the lowest-friction surface for actions. Commands can be contributed to the palette, hidden from it with a menu `when` clause, or shown only in specific menus.

For this repo:

- Good for `Refresh Vivado Projects`, `Run Synthesis`, `Run Implementation`, `Generate Bitstream`, `Open Vivado TCL Shell`, and `Open Report`.
- Use clear command titles and keep command IDs stable.
- Use menus to expose the same commands from tree items and view title actions.

### Activity Bar And View Containers

A View Container is the top-level container represented in the Activity Bar or Panel. The current extension contributes a custom activity bar container for the Projects view.

For this repo:

- A single Vivado container is probably enough.
- Keep the Projects tree as the primary navigation surface.
- Add more views inside the same container only when they represent persistent project state, such as Runs or Reports.
- Avoid adding multiple activity bar icons unless the workflows are truly separate.

References:

- [Extending Workbench](https://code.visualstudio.com/api/extension-capabilities/extending-workbench)
- [Activity Bar UX](https://code.visualstudio.com/api/ux-guidelines/activity-bar)
- [Sidebars UX](https://code.visualstudio.com/api/ux-guidelines/sidebars)

### Views

Views can appear in the Primary Sidebar, Secondary Sidebar, or Panel. They can contain Tree Views, Welcome Views, or Webview Views, and users can move them between containers.

For this repo:

- Use a Tree View for Vivado projects, filesets, sources, constraints, IP, block designs, runs, and reports.
- Use Welcome Views for an empty workspace, missing Vivado path, or no `.xpr` files found.
- Use view title actions for refresh, project discovery, and maybe "Open Vivado".
- Use tree item context actions for item-specific commands such as run, stop, reveal, add file, remove file, or open report.

References:

- [Views UX](https://code.visualstudio.com/api/ux-guidelines/views)
- [Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)
- [views contribution point](https://code.visualstudio.com/api/references/contribution-points#contributes.views)
- [viewsContainers contribution point](https://code.visualstudio.com/api/references/contribution-points#contributes.viewsContainers)
- [viewsWelcome contribution point](https://code.visualstudio.com/api/references/contribution-points#contributes.viewsWelcome)

### Tree Views

Tree Views are ideal for hierarchical project data. A tree provider supplies items, children, labels, icons, commands, tooltips, context values, and refresh events.

For this repo, a Vivado tree could look like:

```text
Project: design.xpr
  Design Sources
  Simulation Sources
  Constraints
  IP
  Block Designs
  Runs
    Synthesis
    Implementation
    Bitstream
  Reports
    Timing
    Utilization
    DRC
```

Useful implementation details:

- Use `contextValue` on tree items so `view/item/context` menu entries only appear where they make sense.
- Use `resourceUri` so file icons and file commands behave naturally.
- Use `TreeItem.command` for simple "open this file/report" behavior.
- Use `onDidChangeTreeData` to refresh when project files, tasks, or run state change.
- Keep tree commands explicit; avoid making every tree row behave like a button.

### Webviews And Webview Views

Webviews are fully custom HTML surfaces. They are powerful, but they should be the last choice after native views, editors, quick picks, and status items.

For this repo:

- Reasonable webview candidates: rich timing-summary dashboards, block-design previews, waveform-adjacent summaries, or report visualizations that cannot fit a Tree View or text editor.
- Prefer normal editors for report files, logs, generated TCL, and source files.
- Prefer Tree Views for project navigation and run state.
- Make any webview theme-aware, accessible, and scoped to the active workspace/window.

References:

- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Webviews UX](https://code.visualstudio.com/api/ux-guidelines/webviews)

### Custom Editors

Custom Editors replace or augment the normal editor for specific file types. They use webviews for rendering, but integrate with editor lifecycle events such as save, revert, and undo/redo.

For this repo:

- Possible later use: visual editors for generated metadata, report summaries, waveform indexes, or Vivado artifacts that are hard to read as text.
- Avoid custom editors for `.xpr`, `.xdc`, `.tcl`, HDL, or reports until there is a strong reason. These files should stay transparent and text-first.

Reference:

- [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)

### Status Bar

Status bar items are useful for compact, contextual state.

For this repo:

- Good candidates: active Vivado version, selected project, active run state, or workspace trust/run-disabled state.
- Keep status items short and actionable.
- Use output/progress surfaces for detailed information.

Reference:

- [Status Bar UX](https://code.visualstudio.com/api/ux-guidelines/status-bar)

### Panel

The Panel is where users expect terminal, output, debug console, problems, and other lower-screen workflow surfaces.

For this repo:

- Use the Output panel for logs.
- Use Terminal or Task terminal integration for command execution.
- Use Problems for parsed diagnostics.
- Consider Panel views for persistent run/report lists only if the sidebar becomes too crowded.

Reference:

- [Panel UX](https://code.visualstudio.com/api/ux-guidelines/panel)

### Editor Surfaces

Extensions can add editor actions and language features to source files. Some are general editor integrations; some are language-specific.

For this repo:

- Diagnostics: Vivado warnings and errors linked to HDL, XDC, TCL, or generated sources.
- Code lenses: possible "Run Simulation", "Open Related Report", or "Show In Project Tree" actions.
- Hovers: decoded Vivado message IDs, constraints info, IP metadata, or report references.
- Definitions/references: possible HDL or constraint navigation if language support grows.
- Document symbols, folding, formatting, snippets, and completions: useful if the extension adds TCL, XDC, or Vivado-specific language behavior.

References:

- [Language Extensions Overview](https://code.visualstudio.com/api/language-extensions/overview)
- [Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)
- [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
- [Editor Actions UX](https://code.visualstudio.com/api/ux-guidelines/editor-actions)

## Workflow Surfaces

### Tasks

Tasks are a strong fit for Vivado command execution because they preserve shell output, cancellation, problem matching, and reproducibility.

For this repo:

- Use tasks for synthesis, implementation, bitstream generation, simulation, report generation, and checked-in TCL scripts.
- Keep the generated shell command or TCL visible.
- Add problem matchers for Vivado messages.
- Consider a Task Provider when the extension can auto-detect project-specific tasks instead of only launching ad hoc tasks.

Reference:

- [Task Provider](https://code.visualstudio.com/api/extension-guides/task-provider)

### Debuggers

Debugger extensions integrate with VS Code's Run and Debug experience. The current extension already launches generated C simulation output through the C++ debugger.

For this repo:

- Keep using the C/C++ extension for native executables where possible.
- Consider debugger extension work only if Vivado or simulator debugging needs a custom debug adapter.

Reference:

- [Debugger Extension](https://code.visualstudio.com/api/extension-guides/debugger-extension)

### Testing API

The Testing API lets extensions discover tests and publish run results in the Test Explorer.

For this repo:

- Good candidate for HDL testbenches, simulation sets, Vitis HLS C tests, or project-defined regression suites.
- Use lazy discovery for large workspaces.
- Publish simulation results, failures, and coverage if the data can be mapped cleanly.
- Keep task-based execution available for users who prefer visible commands.

Reference:

- [Testing API](https://code.visualstudio.com/api/extension-guides/testing)

### Source Control

The Source Control API is for SCM providers. It is probably not a core surface for Vivado itself, because VS Code already has Git support.

For this repo:

- Do not implement SCM unless there is a non-Git artifact-management workflow that needs its own source control model.
- Prefer file decorations, tree indicators, or diagnostics for generated/stale Vivado artifacts.

Reference:

- [Source Control API](https://code.visualstudio.com/api/extension-guides/scm-provider)

### Virtual Documents And File Systems

Virtual documents let an extension expose generated or computed text content through a URI. File system providers go further and expose a full virtual file system.

For this repo:

- Good candidates: generated TCL previews, Vivado report summaries, tool introspection output, or "open original generated file" views.
- Prefer real workspace files when users may edit, commit, or pass them to Vivado.

Reference:

- [Virtual Documents](https://code.visualstudio.com/api/extension-guides/virtual-documents)

### Notebooks

Notebook APIs are best for cell-based documents and computed outputs.

For this repo:

- Probably not a first-phase surface.
- Could become interesting for exploratory timing/report analysis, but Tree Views, text reports, tasks, and webviews are simpler first choices.

Reference:

- [Notebook API](https://code.visualstudio.com/api/extension-guides/notebook)

## Background Services

Background services in VS Code extensions are not separate daemons by default. They are runtime objects started by `activate(context)` and kept alive while the extension is active.

Useful background patterns for this repo:

- Project discovery service: find `.xpr` files and parse basic metadata.
- File watcher service: watch `.xpr`, `.xci`, `.bd`, `.xdc`, HDL, TCL, and report outputs.
- Run state service: track active `vscode.TaskExecution` instances and update tree/status/progress surfaces.
- Diagnostics service: parse task output or logs and update a `DiagnosticCollection`.
- Tool environment service: resolve Vivado path, run `vivado -version`, and cache discovered capabilities.
- Report index service: discover generated timing, utilization, DRC, methodology, and power reports.

Implementation notes:

- Add watchers, event listeners, output channels, and providers to `context.subscriptions`.
- Use `vscode.workspace.fs` where practical so the code is friendlier to remote workspaces.
- Debounce file watcher refreshes; Vivado can update many files at once.
- Keep long work cancellable or at least async.
- Surface background errors in the output channel, not noisy notifications.
- Use notifications only for user-actionable issues such as missing tool paths or failed commands.

## Surface Choices For `vscode-vivado`

| Need | Recommended surface | Why |
| --- | --- | --- |
| Discover Vivado projects | `workspaceContains:**/*.xpr`, file watchers, project manager service | Activates only in relevant workspaces and keeps state fresh. |
| Navigate project structure | Tree View in one custom View Container | Matches the existing extension and the shape of Vivado projects. |
| Empty or unconfigured workspace | Welcome View plus settings command | Gives users a path forward without a custom UI. |
| Run synthesis/implementation/bitstream | VS Code Tasks plus commands and tree actions | Keeps Vivado output visible, cancellable, and problem-matchable. |
| Show run logs | Output channel and task terminal | Native place for verbose tool output. |
| Show warnings/errors | Problem matchers and diagnostics | Makes Vivado messages actionable in the Problems panel and editors. |
| Show reports | Open text/HTML reports directly; add tree report nodes | Transparent, simple, and easy to commit/share. |
| Show run progress | `withProgress`, tree refresh, optional status bar item | Provides feedback without taking over the UI. |
| Pick projects/runs/scripts | Quick Pick | Fast and native for one-off selections. |
| Rich report dashboard | Webview panel or Webview View, later | Useful only when text/tree views are not enough. |
| Simulation/test suites | Testing API, later | Native Test Explorer support for discoverable regressions. |
| HDL/XDC/TCL intelligence | Language APIs or Language Server, later | Fits editor-first language features. |

## Practical First Pass

For the first real Vivado milestone, the likely extension shape is:

1. Add `.xpr` activation through `workspaceContains:**/*.xpr`.
2. Add a Vivado project discovery service with debounced file watchers.
3. Replace or extend the Projects Tree View with Vivado source, constraint, IP, block design, run, and report nodes.
4. Add commands for refresh, open project file, open report, run synthesis, run implementation, generate bitstream, and stop active run.
5. Launch Vivado through VS Code tasks backed by visible TCL.
6. Parse warnings/errors into problem matchers and diagnostics.
7. Keep advanced surfaces, such as webviews, custom editors, notebooks, or a custom debugger, out of the first pass unless the native surfaces are clearly insufficient.

That keeps the extension close to VS Code's normal interaction model while still giving Vivado users the parts they want most: project awareness, reliable task execution, readable logs, and actionable diagnostics.

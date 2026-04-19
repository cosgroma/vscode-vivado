/**
 * Tests for cleaning generated outputs for selected Vivado runs.
 * Covers the guarded clean implementation slice for #12.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import cleanVivadoRunOutputs, {
    buildVivadoCleanRunOutputsTaskName,
    buildVivadoCleanRunOutputsTcl,
    cleanVivadoRunOutputsCommandId,
    resolveCleanRunOutputsTarget,
} from '../../commands/vivado/clean-run-outputs';
import { vivadoTaskSource } from '../../constants';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoRun, VivadoRunStatus, VivadoRunType } from '../../models/vivado-run';
import { quoteTclString } from '../../utils/vivado-tcl';

function makeProject(runs: VivadoRun[] = [makeSynthesisRun('synth_1'), makeImplementationRun('impl_1')]): VivadoProject {
    return new VivadoProject({
        name: 'demo',
        uri: vscode.Uri.file('/workspace/demo'),
        xprFile: vscode.Uri.file('/workspace/demo/demo.xpr'),
        runs,
    });
}

function makeSynthesisRun(name: string): VivadoRun {
    return new VivadoRun({
        name,
        type: VivadoRunType.Synthesis,
        status: VivadoRunStatus.Complete,
    });
}

function makeImplementationRun(name: string): VivadoRun {
    return new VivadoRun({
        name,
        type: VivadoRunType.Implementation,
        status: VivadoRunStatus.Complete,
        parentRunName: 'synth_1',
    });
}

function makeOtherRun(name: string): VivadoRun {
    return new VivadoRun({
        name,
        type: VivadoRunType.Other,
        status: VivadoRunStatus.Complete,
    });
}

function makeVivadoTaskExecution(): vscode.TaskExecution {
    const task = new vscode.Task(
        { type: 'shell' },
        vscode.TaskScope.Workspace,
        'busy',
        vivadoTaskSource,
        new vscode.ShellExecution('vivado -mode batch'),
    );

    return { task } as vscode.TaskExecution;
}

suite('Vivado clean run outputs TCL generation', () => {
    test('builds guarded project-mode TCL for the selected run', () => {
        const project = makeProject();
        const run = project.runs[0];
        const tcl = buildVivadoCleanRunOutputsTcl(project, run);

        assert.strictEqual(
            tcl,
            [
                `open_project ${quoteTclString(project.xprFile.fsPath)}`,
                `set selected_run [get_runs ${quoteTclString(run.name)}]`,
                'if {[llength $selected_run] != 1} {',
                `    error ${quoteTclString(`Expected exactly one Vivado run named ${run.name}`)}`,
                '}',
                '',
                `set project_root [file normalize ${quoteTclString(project.uri.fsPath)}]`,
                'set run_dir_property [get_property DIRECTORY $selected_run]',
                'if {$run_dir_property eq ""} {',
                `    error ${quoteTclString(`Vivado did not report a run directory for ${run.name}`)}`,
                '}',
                'set run_dir [file normalize $run_dir_property]',
                '',
                'if {$run_dir eq $project_root} {',
                `    error ${quoteTclString('Refusing to delete the project root')}`,
                '}',
                '',
                'set project_parts [file split $project_root]',
                'set run_parts [file split $run_dir]',
                'set prefix [lrange $run_parts 0 [expr {[llength $project_parts] - 1}]]',
                '',
                'if {[llength $run_parts] <= [llength $project_parts] || $prefix ne $project_parts} {',
                '    error "Refusing to delete a run directory outside the project root: $run_dir"',
                '}',
                '',
                'reset_runs $selected_run',
                '',
                'if {[file exists $run_dir]} {',
                '    file delete -force -- $run_dir',
                '}',
                '',
                'close_project',
            ].join('\n'),
        );
        assert.ok(!tcl.includes('delete_runs'));
        assert.ok(!tcl.includes('reset_project'));
    });

    test('builds stable task names from the project and run', () => {
        const project = makeProject();

        assert.strictEqual(
            buildVivadoCleanRunOutputsTaskName(project, project.runs[0]),
            'Vivado: Clean Run Outputs demo/synth_1',
        );
    });
});

suite('Vivado clean run outputs target resolution', () => {
    test('accepts an explicit synthesis run target', () => {
        const project = makeProject();
        const run = project.runs[0];

        assert.deepStrictEqual(resolveCleanRunOutputsTarget({ project, run }), { project, run });
    });

    test('accepts an explicit implementation run target', () => {
        const project = makeProject();
        const run = project.runs[1];

        assert.deepStrictEqual(resolveCleanRunOutputsTarget({ project, run }), { project, run });
    });

    test('rejects project-only targets', () => {
        const project = makeProject();

        assert.throws(
            () => resolveCleanRunOutputsTarget(project),
            /Select a synthesis or implementation run/,
        );
    });

    test('rejects targets without an explicit run', () => {
        const project = makeProject();

        assert.throws(
            () => resolveCleanRunOutputsTarget({ project }),
            /Select a synthesis or implementation run/,
        );
    });

    test('rejects unsupported run types', () => {
        const project = makeProject([makeOtherRun('other_1')]);

        assert.throws(
            () => resolveCleanRunOutputsTarget({ project, run: project.runs[0] }),
            /Select a synthesis or implementation run/,
        );
    });
});

suite('cleanVivadoRunOutputs', () => {
    test('confirms, runs generated TCL through vivadoRun, and refreshes after success', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let capturedTcl = '';
        let capturedTaskName = '';
        let capturedStartPath: vscode.Uri | undefined;
        let confirmMessage = '';
        let confirmDetail: string | undefined;
        let confirmLabel = '';
        let infoMessage = '';
        let refreshed = false;

        const result = await cleanVivadoRunOutputs({ project, run }, {
            dependencies: {
                vivadoRun: async (startPath, tcl, taskName) => {
                    capturedStartPath = startPath;
                    capturedTcl = tcl;
                    capturedTaskName = taskName;
                    return 0;
                },
                showWarningMessage: async (message, options, label) => {
                    confirmMessage = message;
                    confirmDetail = options.detail;
                    confirmLabel = label;
                    return label;
                },
                showInformationMessage: async message => {
                    infoMessage = message;
                    return undefined;
                },
                showErrorMessage: async () => undefined,
                getTaskExecutions: () => [],
                refreshVivadoProjects: () => {
                    refreshed = true;
                },
            },
        });

        assert.strictEqual(result, true);
        assert.strictEqual(confirmMessage, 'Clean generated outputs for Vivado run "synth_1" in "demo"?');
        assert.strictEqual(
            confirmDetail,
            'This resets the run and deletes only the Vivado-reported run directory after path guards pass.',
        );
        assert.strictEqual(confirmLabel, 'Clean Run Outputs');
        assert.strictEqual(capturedStartPath?.fsPath, project.uri.fsPath);
        assert.strictEqual(capturedTaskName, buildVivadoCleanRunOutputsTaskName(project, run));
        assert.strictEqual(capturedTcl, buildVivadoCleanRunOutputsTcl(project, run));
        assert.ok(infoMessage.includes('Vivado clean run outputs completed'));
        assert.strictEqual(refreshed, true);
    });

    test('returns without generating TCL when confirmation is canceled', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let vivadoRunCalled = false;
        let refreshed = false;

        const result = await cleanVivadoRunOutputs({ project, run }, {
            dependencies: {
                vivadoRun: async () => {
                    vivadoRunCalled = true;
                    return 0;
                },
                showWarningMessage: async () => undefined,
                showInformationMessage: async () => undefined,
                showErrorMessage: async () => undefined,
                getTaskExecutions: () => [],
                refreshVivadoProjects: () => {
                    refreshed = true;
                },
            },
        });

        assert.strictEqual(result, false);
        assert.strictEqual(vivadoRunCalled, false);
        assert.strictEqual(refreshed, false);
    });

    test('rejects project targets before confirmation or TCL generation', async () => {
        const project = makeProject();
        let errorMessage = '';
        let warningShown = false;
        let vivadoRunCalled = false;

        const result = await cleanVivadoRunOutputs(project, {
            dependencies: {
                vivadoRun: async () => {
                    vivadoRunCalled = true;
                    return 0;
                },
                showWarningMessage: async () => {
                    warningShown = true;
                    return undefined;
                },
                showInformationMessage: async () => undefined,
                showErrorMessage: async message => {
                    errorMessage = message;
                    return undefined;
                },
                getTaskExecutions: () => [],
                refreshVivadoProjects: () => { /* no-op */ },
            },
        });

        assert.strictEqual(result, false);
        assert.ok(errorMessage.includes('Select a synthesis or implementation run'));
        assert.strictEqual(warningShown, false);
        assert.strictEqual(vivadoRunCalled, false);
    });

    test('rejects concurrent Vivado tasks before confirmation or TCL generation', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let errorMessage = '';
        let warningShown = false;
        let vivadoRunCalled = false;

        const result = await cleanVivadoRunOutputs({ project, run }, {
            dependencies: {
                vivadoRun: async () => {
                    vivadoRunCalled = true;
                    return 0;
                },
                showWarningMessage: async () => {
                    warningShown = true;
                    return undefined;
                },
                showInformationMessage: async () => undefined,
                showErrorMessage: async message => {
                    errorMessage = message;
                    return undefined;
                },
                getTaskExecutions: () => [makeVivadoTaskExecution()],
                refreshVivadoProjects: () => { /* no-op */ },
            },
        });

        assert.strictEqual(result, false);
        assert.strictEqual(warningShown, false);
        assert.strictEqual(vivadoRunCalled, false);
        assert.ok(errorMessage.includes('already running'));
    });

    test('reports nonzero Vivado exits without refreshing', async () => {
        const project = makeProject();
        const run = project.runs[1];
        let errorMessage = '';
        let refreshed = false;

        const result = await cleanVivadoRunOutputs({ project, run }, {
            dependencies: {
                vivadoRun: async () => 1,
                showWarningMessage: async (_message, _options, label) => label,
                showInformationMessage: async () => undefined,
                showErrorMessage: async message => {
                    errorMessage = message;
                    return undefined;
                },
                getTaskExecutions: () => [],
                refreshVivadoProjects: () => {
                    refreshed = true;
                },
            },
        });

        assert.strictEqual(result, false);
        assert.ok(errorMessage.includes('Vivado clean run outputs failed'));
        assert.strictEqual(refreshed, false);
    });

    test('treats undefined Vivado exits as canceled without refreshing', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let infoShown = false;
        let errorShown = false;
        let refreshed = false;

        const result = await cleanVivadoRunOutputs({ project, run }, {
            dependencies: {
                vivadoRun: async () => undefined,
                showWarningMessage: async (_message, _options, label) => label,
                showInformationMessage: async () => {
                    infoShown = true;
                    return undefined;
                },
                showErrorMessage: async () => {
                    errorShown = true;
                    return undefined;
                },
                getTaskExecutions: () => [],
                refreshVivadoProjects: () => {
                    refreshed = true;
                },
            },
        });

        assert.strictEqual(result, false);
        assert.strictEqual(infoShown, false);
        assert.strictEqual(errorShown, false);
        assert.strictEqual(refreshed, false);
    });
});

suite('Vivado clean run outputs package contribution', () => {
    test('contributes Clean Run Outputs only to synthesis and implementation run tree items', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require('../../../package.json');
        const command = pkg.contributes.commands.find((entry: { command: string }) => entry.command === cleanVivadoRunOutputsCommandId);
        const paletteEntry = pkg.contributes.menus.commandPalette.find((entry: { command: string }) => entry.command === cleanVivadoRunOutputsCommandId);
        const contextEntries = pkg.contributes.menus['view/item/context'].filter((entry: { command: string }) => entry.command === cleanVivadoRunOutputsCommandId);

        assert.strictEqual(command.title, 'Clean Run Outputs');
        assert.strictEqual(command.icon, '$(trash)');
        assert.strictEqual(paletteEntry.when, 'false');
        assert.deepStrictEqual(
            contextEntries.map((entry: { when: string }) => entry.when).sort(),
            [
                'view == projectsView && viewItem == vivadoImplementationRunItem',
                'view == projectsView && viewItem == vivadoSynthesisRunItem',
            ],
        );
    });
});

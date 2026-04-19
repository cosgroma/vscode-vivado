/**
 * Tests for resetting selected Vivado runs through generated TCL.
 * Covers the second implementation slice for #12.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { vivadoTaskSource } from '../../constants';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoRun, VivadoRunStatus, VivadoRunType } from '../../models/vivado-run';
import resetVivadoRun, {
    buildVivadoResetRunTaskName,
    buildVivadoResetRunTcl,
    resetVivadoRunCommandId,
    resolveResetRunTarget,
} from '../../commands/vivado/reset-run';
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

suite('Vivado reset run TCL generation', () => {
    test('builds project-mode TCL for the selected run', () => {
        const project = makeProject();
        const run = project.runs[0];

        assert.strictEqual(
            buildVivadoResetRunTcl(project, run),
            [
                `open_project ${quoteTclString(project.xprFile.fsPath)}`,
                `set selected_run [get_runs ${quoteTclString(run.name)}]`,
                'if {[llength $selected_run] != 1} {',
                `    error ${quoteTclString(`Expected exactly one Vivado run named ${run.name}`)}`,
                '}',
                'reset_runs $selected_run',
                'close_project',
            ].join('\n'),
        );
    });

    test('builds stable task names from the project and run', () => {
        const project = makeProject();

        assert.strictEqual(
            buildVivadoResetRunTaskName(project, project.runs[0]),
            'Vivado: Reset Run demo/synth_1',
        );
    });
});

suite('Vivado reset run target resolution', () => {
    test('accepts an explicit synthesis run target', () => {
        const project = makeProject();
        const run = project.runs[0];

        assert.deepStrictEqual(resolveResetRunTarget({ project, run }), { project, run });
    });

    test('accepts an explicit implementation run target', () => {
        const project = makeProject();
        const run = project.runs[1];

        assert.deepStrictEqual(resolveResetRunTarget({ project, run }), { project, run });
    });

    test('rejects project-only targets', () => {
        const project = makeProject();

        assert.throws(
            () => resolveResetRunTarget(project),
            /Select a synthesis or implementation run/,
        );
    });

    test('rejects targets without an explicit run', () => {
        const project = makeProject();

        assert.throws(
            () => resolveResetRunTarget({ project }),
            /Select a synthesis or implementation run/,
        );
    });

    test('rejects unsupported run types', () => {
        const project = makeProject([makeOtherRun('other_1')]);

        assert.throws(
            () => resolveResetRunTarget({ project, run: project.runs[0] }),
            /Select a synthesis or implementation run/,
        );
    });
});

suite('resetVivadoRun', () => {
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

        const result = await resetVivadoRun({ project, run }, {
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
        assert.strictEqual(confirmMessage, 'Reset Vivado run "synth_1" in "demo"?');
        assert.strictEqual(confirmDetail, 'This resets the run state and may invalidate downstream results.');
        assert.strictEqual(confirmLabel, 'Reset Run');
        assert.strictEqual(capturedStartPath?.fsPath, project.uri.fsPath);
        assert.strictEqual(capturedTaskName, buildVivadoResetRunTaskName(project, run));
        assert.strictEqual(capturedTcl, buildVivadoResetRunTcl(project, run));
        assert.ok(infoMessage.includes('Vivado reset run completed'));
        assert.strictEqual(refreshed, true);
    });

    test('returns without generating TCL when confirmation is canceled', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let vivadoRunCalled = false;
        let refreshed = false;

        const result = await resetVivadoRun({ project, run }, {
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

        const result = await resetVivadoRun(project, {
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

        const result = await resetVivadoRun({ project, run }, {
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

        const result = await resetVivadoRun({ project, run }, {
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
        assert.ok(errorMessage.includes('Vivado reset run failed'));
        assert.strictEqual(refreshed, false);
    });

    test('treats undefined Vivado exits as canceled without refreshing', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let infoShown = false;
        let errorShown = false;
        let refreshed = false;

        const result = await resetVivadoRun({ project, run }, {
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

suite('Vivado reset run package contribution', () => {
    test('contributes Reset Run only to synthesis and implementation run tree items', () => {
        const pkg = require('../../../package.json');
        const command = pkg.contributes.commands.find((entry: { command: string }) => entry.command === resetVivadoRunCommandId);
        const paletteEntry = pkg.contributes.menus.commandPalette.find((entry: { command: string }) => entry.command === resetVivadoRunCommandId);
        const contextEntries = pkg.contributes.menus['view/item/context'].filter((entry: { command: string }) => entry.command === resetVivadoRunCommandId);

        assert.strictEqual(command.title, 'Reset Run');
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

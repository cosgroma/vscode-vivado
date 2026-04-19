/**
 * Tests for running Vivado implementation through generated TCL.
 * Covers the second implementation slice for #11.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { vivadoTaskSource } from '../../constants';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoRun, VivadoRunStatus, VivadoRunType } from '../../models/vivado-run';
import {
    buildVivadoImplementationTaskName,
    buildVivadoImplementationTcl,
    resolveImplementationTarget,
    runVivadoImplementationCommandId,
} from '../../commands/vivado/run-implementation';
import runVivadoImplementation from '../../commands/vivado/run-implementation';
import { quoteTclString } from '../../utils/vivado-tcl';

function makeProject(runs: VivadoRun[] = [makeImplementationRun('impl_1')]): VivadoProject {
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
        status: VivadoRunStatus.NotStarted,
    });
}

function makeImplementationRun(name: string): VivadoRun {
    return new VivadoRun({
        name,
        type: VivadoRunType.Implementation,
        status: VivadoRunStatus.NotStarted,
        parentRunName: 'synth_1',
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

suite('Vivado implementation TCL generation', () => {
    test('builds project-mode TCL for the selected implementation run', () => {
        const project = makeProject();
        const run = project.runs[0];

        assert.strictEqual(
            buildVivadoImplementationTcl(project, run),
            [
                `open_project ${quoteTclString(project.xprFile.fsPath)}`,
                `launch_runs ${quoteTclString(run.name)}`,
                `wait_on_run ${quoteTclString(run.name)}`,
                `if {[get_property PROGRESS [get_runs ${quoteTclString(run.name)}]] != "100%"} {`,
                `    error ${quoteTclString(`Implementation run ${run.name} did not complete`)}`,
                '}',
                'close_project',
            ].join('\n'),
        );
    });

    test('builds stable task names from the project and run', () => {
        const project = makeProject();

        assert.strictEqual(
            buildVivadoImplementationTaskName(project, project.runs[0]),
            'Vivado: Implementation demo/impl_1',
        );
    });
});

suite('Vivado implementation target resolution', () => {
    test('prefers impl_1 for project-level commands', () => {
        const impl2 = makeImplementationRun('impl_2');
        const impl1 = makeImplementationRun('impl_1');
        const project = makeProject([impl2, impl1]);

        assert.strictEqual(resolveImplementationTarget(project).run, impl1);
    });

    test('falls back to the first sorted implementation run', () => {
        const implB = makeImplementationRun('impl_b');
        const implA = makeImplementationRun('impl_a');
        const project = makeProject([implB, implA]);

        assert.strictEqual(resolveImplementationTarget({ project }).run, implA);
    });

    test('accepts an explicit implementation run target', () => {
        const run = makeImplementationRun('custom_impl');
        const project = makeProject([run]);

        assert.deepStrictEqual(resolveImplementationTarget({ project, run }), { project, run });
    });

    test('rejects incompatible run targets', () => {
        const project = makeProject([makeSynthesisRun('synth_1')]);

        assert.throws(
            () => resolveImplementationTarget({ project, run: project.runs[0] }),
            /Select an implementation run/,
        );
    });

    test('rejects projects without implementation runs', () => {
        const project = makeProject([makeSynthesisRun('synth_1')]);

        assert.throws(
            () => resolveImplementationTarget(project),
            /has no implementation runs/,
        );
    });
});

suite('runVivadoImplementation', () => {
    test('runs generated TCL through vivadoRun and refreshes after success', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let capturedTcl = '';
        let capturedTaskName = '';
        let capturedStartPath: vscode.Uri | undefined;
        let infoMessage = '';
        let refreshed = false;

        const result = await runVivadoImplementation(project, {
            dependencies: {
                vivadoRun: async (startPath, tcl, taskName) => {
                    capturedStartPath = startPath;
                    capturedTcl = tcl;
                    capturedTaskName = taskName;
                    return 0;
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
        assert.strictEqual(capturedStartPath?.fsPath, project.uri.fsPath);
        assert.strictEqual(capturedTaskName, buildVivadoImplementationTaskName(project, run));
        assert.strictEqual(capturedTcl, buildVivadoImplementationTcl(project, run));
        assert.ok(infoMessage.includes('Vivado implementation completed'));
        assert.strictEqual(refreshed, true);
    });

    test('reports missing implementation runs without generating TCL', async () => {
        const project = makeProject([makeSynthesisRun('synth_1')]);
        let errorMessage = '';
        let vivadoRunCalled = false;

        const result = await runVivadoImplementation(project, {
            dependencies: {
                vivadoRun: async () => {
                    vivadoRunCalled = true;
                    return 0;
                },
                showErrorMessage: async message => {
                    errorMessage = message;
                    return undefined;
                },
                showInformationMessage: async () => undefined,
                getTaskExecutions: () => [],
                refreshVivadoProjects: () => { /* no-op */ },
            },
        });

        assert.strictEqual(result, false);
        assert.strictEqual(vivadoRunCalled, false);
        assert.ok(errorMessage.includes('has no implementation runs'));
    });

    test('rejects concurrent Vivado tasks before generating TCL', async () => {
        const project = makeProject();
        let errorMessage = '';
        let vivadoRunCalled = false;

        const result = await runVivadoImplementation(project, {
            dependencies: {
                vivadoRun: async () => {
                    vivadoRunCalled = true;
                    return 0;
                },
                showErrorMessage: async message => {
                    errorMessage = message;
                    return undefined;
                },
                showInformationMessage: async () => undefined,
                getTaskExecutions: () => [makeVivadoTaskExecution()],
                refreshVivadoProjects: () => { /* no-op */ },
            },
        });

        assert.strictEqual(result, false);
        assert.strictEqual(vivadoRunCalled, false);
        assert.ok(errorMessage.includes('already running'));
    });

    test('reports nonzero Vivado exits without refreshing', async () => {
        const project = makeProject();
        let errorMessage = '';
        let refreshed = false;

        const result = await runVivadoImplementation(project, {
            dependencies: {
                vivadoRun: async () => 1,
                showErrorMessage: async message => {
                    errorMessage = message;
                    return undefined;
                },
                showInformationMessage: async () => undefined,
                getTaskExecutions: () => [],
                refreshVivadoProjects: () => {
                    refreshed = true;
                },
            },
        });

        assert.strictEqual(result, false);
        assert.ok(errorMessage.includes('Vivado implementation failed'));
        assert.strictEqual(refreshed, false);
    });
});

suite('Vivado implementation package contribution', () => {
    test('contributes Run Implementation to project and implementation run tree items', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require('../../../package.json');
        const command = pkg.contributes.commands.find((entry: { command: string }) => entry.command === runVivadoImplementationCommandId);
        const paletteEntry = pkg.contributes.menus.commandPalette.find((entry: { command: string }) => entry.command === runVivadoImplementationCommandId);
        const contextEntries = pkg.contributes.menus['view/item/context'].filter((entry: { command: string }) => entry.command === runVivadoImplementationCommandId);

        assert.strictEqual(command.title, 'Run Implementation');
        assert.strictEqual(paletteEntry.when, 'false');
        assert.deepStrictEqual(
            contextEntries.map((entry: { when: string }) => entry.when).sort(),
            [
                'view == projectsView && viewItem == vivadoImplementationRunItem',
                'view == projectsView && viewItem == vivadoProjectItem',
            ],
        );
    });
});

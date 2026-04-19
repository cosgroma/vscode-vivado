/**
 * Tests for running Vivado synthesis through generated TCL.
 * Covers the first implementation slice for #11.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { vivadoTaskSource } from '../../constants';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoRun, VivadoRunStatus, VivadoRunType } from '../../models/vivado-run';
import {
    buildVivadoSynthesisTaskName,
    buildVivadoSynthesisTcl,
    resolveSynthesisTarget,
    runVivadoSynthesisCommandId,
} from '../../commands/vivado/run-synthesis';
import runVivadoSynthesis from '../../commands/vivado/run-synthesis';
import { quoteTclString } from '../../utils/vivado-tcl';

function makeProject(runs: VivadoRun[] = [makeSynthesisRun('synth_1')]): VivadoProject {
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

suite('Vivado synthesis TCL generation', () => {
    test('builds project-mode TCL for the selected synthesis run', () => {
        const project = makeProject();
        const run = project.runs[0];

        assert.strictEqual(
            buildVivadoSynthesisTcl(project, run),
            [
                `open_project ${quoteTclString(project.xprFile.fsPath)}`,
                `launch_runs ${quoteTclString(run.name)}`,
                `wait_on_run ${quoteTclString(run.name)}`,
                `if {[get_property PROGRESS [get_runs ${quoteTclString(run.name)}]] != "100%"} {`,
                `    error ${quoteTclString(`Synthesis run ${run.name} did not complete`)}`,
                '}',
                'close_project',
            ].join('\n'),
        );
    });

    test('builds stable task names from the project and run', () => {
        const project = makeProject();

        assert.strictEqual(
            buildVivadoSynthesisTaskName(project, project.runs[0]),
            'Vivado: Synthesis demo/synth_1',
        );
    });
});

suite('Vivado synthesis target resolution', () => {
    test('prefers synth_1 for project-level commands', () => {
        const synth2 = makeSynthesisRun('synth_2');
        const synth1 = makeSynthesisRun('synth_1');
        const project = makeProject([synth2, synth1]);

        assert.strictEqual(resolveSynthesisTarget(project).run, synth1);
    });

    test('falls back to the first sorted synthesis run', () => {
        const synthB = makeSynthesisRun('synth_b');
        const synthA = makeSynthesisRun('synth_a');
        const project = makeProject([synthB, synthA]);

        assert.strictEqual(resolveSynthesisTarget({ project }).run, synthA);
    });

    test('accepts an explicit synthesis run target', () => {
        const run = makeSynthesisRun('custom_synth');
        const project = makeProject([run]);

        assert.deepStrictEqual(resolveSynthesisTarget({ project, run }), { project, run });
    });

    test('rejects incompatible run targets', () => {
        const project = makeProject([makeImplementationRun('impl_1')]);

        assert.throws(
            () => resolveSynthesisTarget({ project, run: project.runs[0] }),
            /Select a synthesis run/,
        );
    });

    test('rejects projects without synthesis runs', () => {
        const project = makeProject([makeImplementationRun('impl_1')]);

        assert.throws(
            () => resolveSynthesisTarget(project),
            /has no synthesis runs/,
        );
    });
});

suite('runVivadoSynthesis', () => {
    test('runs generated TCL through vivadoRun and refreshes after success', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let capturedTcl = '';
        let capturedTaskName = '';
        let capturedStartPath: vscode.Uri | undefined;
        let infoMessage = '';
        let refreshed = false;

        const result = await runVivadoSynthesis(project, {
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
        assert.strictEqual(capturedTaskName, buildVivadoSynthesisTaskName(project, run));
        assert.strictEqual(capturedTcl, buildVivadoSynthesisTcl(project, run));
        assert.ok(infoMessage.includes('Vivado synthesis completed'));
        assert.strictEqual(refreshed, true);
    });

    test('reports missing synthesis runs without generating TCL', async () => {
        const project = makeProject([makeImplementationRun('impl_1')]);
        let errorMessage = '';
        let vivadoRunCalled = false;

        const result = await runVivadoSynthesis(project, {
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
        assert.ok(errorMessage.includes('has no synthesis runs'));
    });

    test('rejects concurrent Vivado tasks before generating TCL', async () => {
        const project = makeProject();
        let errorMessage = '';
        let vivadoRunCalled = false;

        const result = await runVivadoSynthesis(project, {
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

        const result = await runVivadoSynthesis(project, {
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
        assert.ok(errorMessage.includes('Vivado synthesis failed'));
        assert.strictEqual(refreshed, false);
    });
});

suite('Vivado synthesis package contribution', () => {
    test('contributes Run Synthesis to project and synthesis run tree items', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require('../../../package.json');
        const command = pkg.contributes.commands.find((entry: { command: string }) => entry.command === runVivadoSynthesisCommandId);
        const paletteEntry = pkg.contributes.menus.commandPalette.find((entry: { command: string }) => entry.command === runVivadoSynthesisCommandId);
        const contextEntries = pkg.contributes.menus['view/item/context'].filter((entry: { command: string }) => entry.command === runVivadoSynthesisCommandId);

        assert.strictEqual(command.title, 'Run Synthesis');
        assert.strictEqual(paletteEntry.when, 'false');
        assert.deepStrictEqual(
            contextEntries.map((entry: { when: string }) => entry.when).sort(),
            [
                'view == projectsView && viewItem == vivadoProjectItem',
                'view == projectsView && viewItem == vivadoSynthesisRunItem',
            ],
        );
    });
});

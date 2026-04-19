/**
 * Tests for generating Vivado bitstreams through generated TCL.
 * Covers the final implementation slice for #11.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { vivadoTaskSource } from '../../constants';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoRun, VivadoRunStatus, VivadoRunType } from '../../models/vivado-run';
import {
    buildVivadoBitstreamTaskName,
    buildVivadoBitstreamTcl,
    generateVivadoBitstreamCommandId,
    resolveBitstreamTarget,
} from '../../commands/vivado/generate-bitstream';
import generateVivadoBitstream from '../../commands/vivado/generate-bitstream';
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

suite('Vivado bitstream TCL generation', () => {
    test('builds project-mode TCL for the selected implementation run', () => {
        const project = makeProject();
        const run = project.runs[0];

        assert.strictEqual(
            buildVivadoBitstreamTcl(project, run),
            [
                `open_project ${quoteTclString(project.xprFile.fsPath)}`,
                `launch_runs ${quoteTclString(run.name)} -to_step write_bitstream`,
                `wait_on_run ${quoteTclString(run.name)}`,
                `if {[get_property PROGRESS [get_runs ${quoteTclString(run.name)}]] != "100%"} {`,
                `    error ${quoteTclString(`Bitstream run ${run.name} did not complete`)}`,
                '}',
                'close_project',
            ].join('\n'),
        );
    });

    test('builds stable task names from the project and run', () => {
        const project = makeProject();

        assert.strictEqual(
            buildVivadoBitstreamTaskName(project, project.runs[0]),
            'Vivado: Bitstream demo/impl_1',
        );
    });
});

suite('Vivado bitstream target resolution', () => {
    test('prefers impl_1 for project-level commands', () => {
        const impl2 = makeImplementationRun('impl_2');
        const impl1 = makeImplementationRun('impl_1');
        const project = makeProject([impl2, impl1]);

        assert.strictEqual(resolveBitstreamTarget(project).run, impl1);
    });

    test('falls back to the first sorted implementation run', () => {
        const implB = makeImplementationRun('impl_b');
        const implA = makeImplementationRun('impl_a');
        const project = makeProject([implB, implA]);

        assert.strictEqual(resolveBitstreamTarget({ project }).run, implA);
    });

    test('accepts an explicit implementation run target', () => {
        const run = makeImplementationRun('custom_impl');
        const project = makeProject([run]);

        assert.deepStrictEqual(resolveBitstreamTarget({ project, run }), { project, run });
    });

    test('rejects incompatible run targets', () => {
        const project = makeProject([makeSynthesisRun('synth_1')]);

        assert.throws(
            () => resolveBitstreamTarget({ project, run: project.runs[0] }),
            /Select an implementation run/,
        );
    });

    test('rejects projects without implementation runs', () => {
        const project = makeProject([makeSynthesisRun('synth_1')]);

        assert.throws(
            () => resolveBitstreamTarget(project),
            /has no implementation runs/,
        );
    });
});

suite('generateVivadoBitstream', () => {
    test('runs generated TCL through vivadoRun and refreshes after success', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let capturedTcl = '';
        let capturedTaskName = '';
        let capturedStartPath: vscode.Uri | undefined;
        let infoMessage = '';
        let refreshed = false;

        const result = await generateVivadoBitstream(project, {
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
        assert.strictEqual(capturedTaskName, buildVivadoBitstreamTaskName(project, run));
        assert.strictEqual(capturedTcl, buildVivadoBitstreamTcl(project, run));
        assert.ok(infoMessage.includes('Vivado bitstream generation completed'));
        assert.strictEqual(refreshed, true);
    });

    test('reports missing implementation runs without generating TCL', async () => {
        const project = makeProject([makeSynthesisRun('synth_1')]);
        let errorMessage = '';
        let vivadoRunCalled = false;

        const result = await generateVivadoBitstream(project, {
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

        const result = await generateVivadoBitstream(project, {
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

        const result = await generateVivadoBitstream(project, {
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
        assert.ok(errorMessage.includes('Vivado bitstream generation failed'));
        assert.strictEqual(refreshed, false);
    });
});

suite('Vivado bitstream package contribution', () => {
    test('contributes Generate Bitstream to project and implementation run tree items', () => {
        const pkg = require('../../../package.json');
        const command = pkg.contributes.commands.find((entry: { command: string }) => entry.command === generateVivadoBitstreamCommandId);
        const paletteEntry = pkg.contributes.menus.commandPalette.find((entry: { command: string }) => entry.command === generateVivadoBitstreamCommandId);
        const contextEntries = pkg.contributes.menus['view/item/context'].filter((entry: { command: string }) => entry.command === generateVivadoBitstreamCommandId);

        assert.strictEqual(command.title, 'Generate Bitstream');
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

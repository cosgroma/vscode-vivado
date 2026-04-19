/**
 * Tests for running Vivado behavioral simulation through generated TCL.
 * Covers #15 - Add behavioral XSim run support.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { runVivadoBehavioralSimulationCommandId } from '../../commands/vivado/run-behavioral-simulation';
import runVivadoBehavioralSimulation, {
    buildVivadoBehavioralSimulationTaskName,
    buildVivadoBehavioralSimulationTcl,
    resolveBehavioralSimulationTarget,
} from '../../commands/vivado/run-behavioral-simulation';
import { vivadoTaskSource } from '../../constants';
import { VivadoFile, VivadoFileKind } from '../../models/vivado-file';
import { VivadoFileset, VivadoFilesetKind } from '../../models/vivado-fileset';
import { VivadoProject } from '../../models/vivado-project';
import { quoteTclString } from '../../utils/vivado-tcl';

function makeProject(filesets: VivadoFileset[] = [makeSimulationFileset('sim_1')]): VivadoProject {
    return new VivadoProject({
        name: 'demo',
        uri: vscode.Uri.file('/workspace/demo'),
        xprFile: vscode.Uri.file('/workspace/demo/demo.xpr'),
        filesets,
    });
}

function makeSimulationFileset(name: string): VivadoFileset {
    return new VivadoFileset({
        name,
        kind: VivadoFilesetKind.Simulation,
        files: [
            makeSimulationFile(name, `${name}_tb.sv`),
        ],
    });
}

function makeSimulationFile(filesetName: string, fileName: string = 'top_tb.sv'): VivadoFile {
    return new VivadoFile({
        uri: vscode.Uri.file(`/workspace/demo/sim/${fileName}`),
        kind: VivadoFileKind.SimulationSource,
        filesetName,
    });
}

function makeDesignFile(): VivadoFile {
    return new VivadoFile({
        uri: vscode.Uri.file('/workspace/demo/rtl/top.sv'),
        kind: VivadoFileKind.DesignSource,
        filesetName: 'sources_1',
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

suite('Vivado behavioral simulation TCL generation', () => {
    test('builds project-mode TCL for a simulation fileset', () => {
        const project = makeProject();

        assert.strictEqual(
            buildVivadoBehavioralSimulationTcl({
                project,
                simsetName: 'sim_1',
            }),
            [
                `open_project ${quoteTclString(project.xprFile.fsPath)}`,
                `set simset_name ${quoteTclString('sim_1')}`,
                'set simset [get_filesets -quiet $simset_name]',
                'if {[llength $simset] == 0} {',
                `    error ${quoteTclString('Simulation fileset sim_1 was not found')}`,
                '}',
                'current_fileset -simset $simset',
                'launch_simulation -simset $simset_name -mode behavioral',
                'run all',
                'close_sim',
                'close_project',
            ].join('\n'),
        );
    });

    test('annotates TCL generated from a selected simulation source', () => {
        const project = makeProject();
        const sourceFile = makeSimulationFile('sim_1', 'top_tb.sv');

        assert.ok(
            buildVivadoBehavioralSimulationTcl({
                project,
                simsetName: 'sim_1',
                sourceFile,
            }).startsWith(`# Selected simulation source: ${sourceFile.uri.fsPath}\nopen_project`),
        );
    });

    test('builds stable task names from the project and simulation fileset', () => {
        assert.strictEqual(
            buildVivadoBehavioralSimulationTaskName(makeProject(), 'sim_1'),
            'Vivado: Behavioral Simulation demo/sim_1',
        );
    });
});

suite('Vivado behavioral simulation target resolution', () => {
    test('prefers sim_1 for project-level commands', () => {
        const sim2 = makeSimulationFileset('sim_2');
        const sim1 = makeSimulationFileset('sim_1');
        const project = makeProject([sim2, sim1]);

        assert.deepStrictEqual(resolveBehavioralSimulationTarget(project), {
            project,
            simsetName: 'sim_1',
        });
    });

    test('falls back to the first sorted simulation fileset', () => {
        const simB = makeSimulationFileset('sim_b');
        const simA = makeSimulationFileset('sim_a');
        const project = makeProject([simB, simA]);

        assert.strictEqual(resolveBehavioralSimulationTarget({ project }).simsetName, 'sim_a');
    });

    test('uses the selected simulation source fileset', () => {
        const selectedFile = makeSimulationFile('sim_custom');
        const project = makeProject([new VivadoFileset({
            name: 'sim_custom',
            kind: VivadoFilesetKind.Simulation,
            files: [selectedFile],
        })]);

        assert.deepStrictEqual(resolveBehavioralSimulationTarget({ project, file: selectedFile }), {
            project,
            simsetName: 'sim_custom',
            sourceFile: selectedFile,
        });
    });

    test('rejects projects without simulation filesets', () => {
        const project = makeProject([]);

        assert.throws(
            () => resolveBehavioralSimulationTarget(project),
            /has no simulation filesets/,
        );
    });

    test('rejects non-simulation source file targets', () => {
        const project = makeProject();

        assert.throws(
            () => resolveBehavioralSimulationTarget({ project, file: makeDesignFile() }),
            /Select a Vivado simulation source file/,
        );
    });
});

suite('runVivadoBehavioralSimulation', () => {
    test('runs generated TCL through vivadoRun and refreshes after success', async () => {
        const project = makeProject();
        let capturedTcl = '';
        let capturedTaskName = '';
        let capturedStartPath: vscode.Uri | undefined;
        let infoMessage = '';
        let refreshed = false;

        const result = await runVivadoBehavioralSimulation(project, {
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
        assert.strictEqual(capturedTaskName, buildVivadoBehavioralSimulationTaskName(project, 'sim_1'));
        assert.strictEqual(capturedTcl, buildVivadoBehavioralSimulationTcl({ project, simsetName: 'sim_1' }));
        assert.ok(infoMessage.includes('Vivado behavioral simulation completed'));
        assert.strictEqual(refreshed, true);
    });

    test('reports missing simulation filesets without generating TCL', async () => {
        const project = makeProject([]);
        let errorMessage = '';
        let vivadoRunCalled = false;

        const result = await runVivadoBehavioralSimulation(project, {
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
        assert.ok(errorMessage.includes('has no simulation filesets'));
    });

    test('rejects concurrent Vivado tasks before generating TCL', async () => {
        const project = makeProject();
        let errorMessage = '';
        let vivadoRunCalled = false;

        const result = await runVivadoBehavioralSimulation(project, {
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

        const result = await runVivadoBehavioralSimulation(project, {
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
        assert.ok(errorMessage.includes('Vivado behavioral simulation failed'));
        assert.strictEqual(refreshed, false);
    });

    test('treats undefined Vivado exits as canceled without refreshing', async () => {
        const project = makeProject();
        let refreshed = false;

        const result = await runVivadoBehavioralSimulation(project, {
            dependencies: {
                vivadoRun: async () => undefined,
                showErrorMessage: async () => undefined,
                showInformationMessage: async () => undefined,
                getTaskExecutions: () => [],
                refreshVivadoProjects: () => {
                    refreshed = true;
                },
            },
        });

        assert.strictEqual(result, false);
        assert.strictEqual(refreshed, false);
    });
});

suite('Vivado behavioral simulation package contribution', () => {
    test('contributes Run Behavioral Simulation to project and simulation source file items', () => {
        const pkg = require('../../../package.json');
        const command = pkg.contributes.commands.find((entry: { command: string }) => entry.command === runVivadoBehavioralSimulationCommandId);
        const paletteEntry = pkg.contributes.menus.commandPalette.find((entry: { command: string }) => entry.command === runVivadoBehavioralSimulationCommandId);
        const contextEntries = pkg.contributes.menus['view/item/context'].filter((entry: { command: string }) => entry.command === runVivadoBehavioralSimulationCommandId);

        assert.strictEqual(command.title, 'Run Behavioral Simulation');
        assert.strictEqual(paletteEntry.when, 'false');
        assert.deepStrictEqual(
            contextEntries.map((entry: { when: string }) => entry.when).sort(),
            [
                'view == projectsView && viewItem == vivadoProjectItem',
                'view == projectsView && viewItem == vivadoSimulationSourceFileItem',
            ],
        );
    });
});

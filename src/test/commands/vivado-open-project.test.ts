/**
 * Tests for opening Vivado projects in the Vivado GUI.
 * Covers #10 - Add command to open a Vivado project in the GUI.
 */
import { EventEmitter } from 'events';
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoSettings } from '../../utils/vivado-settings';
import {
    buildVivadoGuiLaunch,
    buildVivadoOpenProjectTcl,
    openVivadoProjectCommandId,
    SpawnedVivadoProcess,
    VivadoGuiLaunch,
    VivadoGuiSpawn,
} from '../../commands/vivado/open-project';
import openVivadoProject from '../../commands/vivado/open-project';

function makeSettings(overrides: Partial<VivadoSettings> = {}): VivadoSettings {
    return {
        vivadoPath: '/tools/vivado',
        vivadoExecutablePath: '',
        vivadoSettingsScript: '',
        projectSearchGlobs: ['**/*.xpr'],
        reportsDirectory: 'reports',
        generatedTclDirectory: '.vscode-vivado/tcl',
        preserveRunLogs: true,
        resolvedExecutablePath: '/tools/vivado/bin/vivado',
        pathEntries: ['/tools/vivado/bin'],
        ...overrides,
    };
}

function makeProject(name: string = 'demo'): VivadoProject {
    return new VivadoProject({
        name,
        uri: vscode.Uri.file(`/workspace/${name}`),
        xprFile: vscode.Uri.file(`/workspace/${name}/${name}.xpr`),
    });
}

function makeFakeProcess(): SpawnedVivadoProcess & EventEmitter & { unrefCalled: boolean } {
    const process = new EventEmitter() as SpawnedVivadoProcess & EventEmitter & { unrefCalled: boolean };
    process.unrefCalled = false;
    process.unref = () => {
        process.unrefCalled = true;
    };
    return process;
}

suite('Vivado open project command construction', () => {
    test('builds TCL that opens the selected .xpr project', () => {
        const project = new VivadoProject({
            name: 'demo',
            uri: vscode.Uri.file('C:/workspace/demo'),
            xprFile: vscode.Uri.file('C:/workspace/demo/demo.xpr'),
        });

        assert.strictEqual(
            buildVivadoOpenProjectTcl(project),
            'open_project "c:\\\\workspace\\\\demo\\\\demo.xpr"',
        );
    });

    test('builds a Windows GUI launch through cmd.exe for batch executables', () => {
        const project = makeProject();
        const launch = buildVivadoGuiLaunch(
            project,
            vscode.Uri.file('C:/workspace/demo/.vscode-vivado/tcl/open.tcl'),
            makeSettings({
                vivadoSettingsScript: 'C:\\Xilinx\\Vivado\\2023.2\\settings64.bat',
                resolvedExecutablePath: 'C:\\Xilinx\\Vivado\\2023.2\\bin\\vivado.bat',
                pathEntries: ['C:\\Xilinx\\Vivado\\2023.2\\bin'],
            }),
            {
                platform: 'win32',
                environment: { Path: 'C:\\Windows\\System32' },
            },
        );

        assert.strictEqual(launch.command, 'cmd.exe');
        assert.deepStrictEqual(launch.args.slice(0, 2), ['/d', '/c']);
        assert.ok(launch.args[2].includes('call "C:\\Xilinx\\Vivado\\2023.2\\settings64.bat"'));
        assert.ok(launch.args[2].includes('"C:\\Xilinx\\Vivado\\2023.2\\bin\\vivado.bat" -mode gui -source'));
        assert.strictEqual(launch.options.cwd, project.uri.fsPath);
        assert.strictEqual(launch.options.detached, true);
    });
});

suite('openVivadoProject', () => {
    test('writes visible TCL and launches Vivado from the project directory', async () => {
        const project = makeProject();
        const spawnedProcess = makeFakeProcess();
        const spawnCalls: Array<Pick<VivadoGuiLaunch, 'command' | 'args' | 'options'>> = [];
        let writtenTcl = '';
        let shownError: string | undefined;

        const spawnVivado: VivadoGuiSpawn = (command, args, options) => {
            spawnCalls.push({ command, args, options });
            setImmediate(() => spawnedProcess.emit('spawn'));
            return spawnedProcess;
        };

        const result = await openVivadoProject(project, {
            settings: makeSettings(),
            platform: 'linux',
            now: new Date('2026-04-19T00:00:00Z'),
            dependencies: {
                environment: { PATH: '/usr/bin' },
                existsSync: filePath => [
                    project.xprFile.fsPath,
                    '/tools/vivado/bin/vivado',
                ].includes(filePath),
                spawn: spawnVivado,
                writeTclScript: options => {
                    writtenTcl = options.tcl;
                    return { uri: options.uri!, content: options.tcl };
                },
                showErrorMessage: async message => {
                    shownError = message;
                    return undefined;
                },
                appendLine: () => { /* no-op */ },
            },
        });

        assert.strictEqual(result, true);
        assert.strictEqual(shownError, undefined);
        assert.strictEqual(writtenTcl, buildVivadoOpenProjectTcl(project));
        assert.strictEqual(spawnCalls.length, 1);
        assert.strictEqual(spawnCalls[0].command, '/tools/vivado/bin/vivado');
        assert.deepStrictEqual(spawnCalls[0].args.slice(0, 3), ['-mode', 'gui', '-source']);
        assert.strictEqual(spawnCalls[0].options.cwd, project.uri.fsPath);
        assert.strictEqual((spawnCalls[0].options.env as NodeJS.ProcessEnv).PATH, '/tools/vivado/bin:/usr/bin');
        assert.strictEqual(spawnedProcess.unrefCalled, true);
    });

    test('shows an actionable error when the project file is missing', async () => {
        const project = makeProject();
        let shownError = '';
        let spawnCalled = false;

        const result = await openVivadoProject(project, {
            settings: makeSettings(),
            platform: 'linux',
            dependencies: {
                existsSync: () => false,
                spawn: () => {
                    spawnCalled = true;
                    return makeFakeProcess();
                },
                showErrorMessage: async message => {
                    shownError = message;
                    return undefined;
                },
                appendLine: () => { /* no-op */ },
            },
        });

        assert.strictEqual(result, false);
        assert.strictEqual(spawnCalled, false);
        assert.ok(shownError.includes('Vivado project file not found'));
        assert.ok(shownError.includes(project.xprFile.fsPath));
    });

    test('shows an actionable error when the Vivado executable is missing', async () => {
        const project = makeProject();
        let shownError = '';
        let spawnCalled = false;

        const result = await openVivadoProject(project, {
            settings: makeSettings({
                resolvedExecutablePath: '/missing/vivado/bin/vivado',
                pathEntries: ['/missing/vivado/bin'],
            }),
            platform: 'linux',
            dependencies: {
                existsSync: filePath => filePath === project.xprFile.fsPath,
                spawn: () => {
                    spawnCalled = true;
                    return makeFakeProcess();
                },
                showErrorMessage: async message => {
                    shownError = message;
                    return undefined;
                },
                appendLine: () => { /* no-op */ },
            },
        });

        assert.strictEqual(result, false);
        assert.strictEqual(spawnCalled, false);
        assert.ok(shownError.includes('Vivado executable not found'));
        assert.ok(shownError.includes('vscode-vivado.vivadoPath'));
    });

    test('shows an actionable error when Vivado cannot be spawned', async () => {
        const project = makeProject();
        const spawnedProcess = makeFakeProcess();
        let shownError = '';

        const result = await openVivadoProject(project, {
            settings: makeSettings(),
            platform: 'linux',
            dependencies: {
                environment: { PATH: '/usr/bin' },
                existsSync: filePath => [
                    project.xprFile.fsPath,
                    '/tools/vivado/bin/vivado',
                ].includes(filePath),
                spawn: () => {
                    setImmediate(() => spawnedProcess.emit('error', new Error('ENOENT')));
                    return spawnedProcess;
                },
                writeTclScript: options => ({ uri: options.uri!, content: options.tcl }),
                showErrorMessage: async message => {
                    shownError = message;
                    return undefined;
                },
                appendLine: () => { /* no-op */ },
            },
        });

        assert.strictEqual(result, false);
        assert.ok(shownError.includes('Failed to launch Vivado: ENOENT'));
    });
});

suite('Vivado open project package contribution', () => {
    test('contributes the Open in Vivado command only to Vivado project tree items', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require('../../../package.json');
        const command = pkg.contributes.commands.find((entry: { command: string }) => entry.command === openVivadoProjectCommandId);
        const paletteEntry = pkg.contributes.menus.commandPalette.find((entry: { command: string }) => entry.command === openVivadoProjectCommandId);
        const contextEntry = pkg.contributes.menus['view/item/context'].find((entry: { command: string }) => entry.command === openVivadoProjectCommandId);

        assert.strictEqual(command.title, 'Open in Vivado');
        assert.strictEqual(paletteEntry.when, 'false');
        assert.strictEqual(contextEntry.when, 'view == projectsView && viewItem == vivadoProjectItem');
    });
});

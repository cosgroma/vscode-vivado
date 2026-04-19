/**
 * Tests for the vivadoRun helper.
 * Covers #5 - Implement vivadoRun helper for TCL-backed batch tasks.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { vivadoTaskSource } from '../../constants';
import { VivadoSettings } from '../../utils/vivado-settings';
import {
    buildVivadoCommandLine,
    buildVivadoEnvironment,
    vivadoRun,
    vivadoRunScript,
} from '../../utils/vivado-run';

function makeSettings(overrides: Partial<VivadoSettings> = {}): VivadoSettings {
    return {
        vivadoPath: 'C:\\Xilinx\\Vivado\\2023.2',
        vivadoExecutablePath: '',
        vivadoSettingsScript: '',
        projectSearchGlobs: ['**/*.xpr'],
        reportsDirectory: 'reports',
        preserveRunLogs: true,
        resolvedExecutablePath: 'C:\\Xilinx\\Vivado\\2023.2\\bin\\vivado.bat',
        pathEntries: ['C:\\Xilinx\\Vivado\\2023.2\\bin'],
        ...overrides,
    };
}

function stubVivadoRunTasks(exitCode: number | undefined): {
    cleanup: () => void;
    getTask: () => vscode.Task | undefined;
} {
    let capturedTask: vscode.Task | undefined;

    const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
    Object.defineProperty(vscode.tasks, 'executeTask', {
        value: (task: vscode.Task) => {
            capturedTask = task;
            return Promise.resolve({ task } as unknown as vscode.TaskExecution);
        },
        configurable: true,
        writable: true,
    });

    const origEndTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'onDidEndTaskProcess');
    Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', {
        value: (handler: (e: { execution: vscode.TaskExecution; exitCode: number | undefined }) => void) => {
            setImmediate(() => {
                if (capturedTask) {
                    handler({
                        execution: { task: capturedTask } as unknown as vscode.TaskExecution,
                        exitCode,
                    });
                }
            });
            return { dispose: () => { /* no-op */ } };
        },
        configurable: true,
        writable: true,
    });

    return {
        cleanup: () => {
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
            if (origEndTask) { Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', origEndTask); }
        },
        getTask: () => capturedTask,
    };
}

suite('vivadoRun command construction', () => {
    test('builds a direct Vivado batch command for Windows', () => {
        const command = buildVivadoCommandLine(
            makeSettings(),
            'C:\\work\\run synth.tcl',
            'win32',
        );

        assert.strictEqual(
            command,
            'cmd.exe /d /c """C:\\Xilinx\\Vivado\\2023.2\\bin\\vivado.bat"" -mode batch -source ""C:\\work\\run synth.tcl"""'
        );
    });

    test('builds a source-settings command for Windows batch shells', () => {
        const command = buildVivadoCommandLine(
            makeSettings({
                vivadoSettingsScript: 'C:\\Xilinx\\Vivado\\2023.2\\settings64.bat',
            }),
            'C:\\work\\run synth.tcl',
            'win32',
        );

        assert.strictEqual(
            command,
            'cmd.exe /d /c "call ""C:\\Xilinx\\Vivado\\2023.2\\settings64.bat"" && ""C:\\Xilinx\\Vivado\\2023.2\\bin\\vivado.bat"" -mode batch -source ""C:\\work\\run synth.tcl"""'
        );
    });

    test('builds a source-settings command for POSIX shells', () => {
        const command = buildVivadoCommandLine(
            makeSettings({
                vivadoSettingsScript: '/opt/Xilinx/Vivado/2024.2/settings64.sh',
                resolvedExecutablePath: '/opt/Xilinx/Vivado/2024.2/bin/vivado',
                pathEntries: ['/opt/Xilinx/Vivado/2024.2/bin'],
            }),
            "/tmp/run user's script.tcl",
            'linux',
        );

        assert.strictEqual(
            command,
            ". '/opt/Xilinx/Vivado/2024.2/settings64.sh' && '/opt/Xilinx/Vivado/2024.2/bin/vivado' -mode batch -source '/tmp/run user'\\''s script.tcl'"
        );
    });

    test('prepends configured Vivado path entries to PATH', () => {
        const env = buildVivadoEnvironment(
            makeSettings({
                pathEntries: ['/tools/vivado/bin'],
            }),
            { PATH: '/usr/bin' },
            'linux',
        );

        assert.strictEqual(env.PATH, '/tools/vivado/bin:/usr/bin');
    });
});

suite('vivadoRun task execution', () => {
    test('writes generated TCL to a temp file before executing the task', async () => {
        const expectedTcl = 'open_project project.xpr\nexit';
        const { cleanup, getTask } = stubVivadoRunTasks(0);

        let result: number | undefined;
        let tclFilePath: string | undefined;
        let tclFileContent: string | undefined;

        try {
            result = await vivadoRun(
                vscode.Uri.file('/workspace'),
                expectedTcl,
                'vivado-tcl-content-check',
                {
                    settings: makeSettings({
                        resolvedExecutablePath: '/opt/Xilinx/Vivado/2024.2/bin/vivado',
                        pathEntries: ['/opt/Xilinx/Vivado/2024.2/bin'],
                    }),
                    platform: 'linux',
                    preserveTclFile: true,
                },
            );
        } finally {
            cleanup();
        }

        const capturedTask = getTask();
        assert.ok(capturedTask, 'executeTask must have been called');
        const commandLine = (capturedTask!.execution as vscode.ShellExecution).commandLine ?? '';
        const match = commandLine.match(/-source '([^']+)'/);
        assert.ok(match, 'Vivado command line must include a quoted -source path');
        tclFilePath = match![1];
        tclFileContent = fs.readFileSync(tclFilePath, 'utf8');
        fs.unlinkSync(tclFilePath);

        assert.strictEqual(result, 0);
        assert.ok(path.basename(tclFilePath).startsWith('vscode-vivado-tcl-'));
        assert.strictEqual(tclFileContent, expectedTcl);
    });

    test('runs a checked-in TCL script without generating a new script', async () => {
        const scriptPath = vscode.Uri.file('/workspace/scripts/run_synth.tcl');
        const { cleanup, getTask } = stubVivadoRunTasks(0);

        try {
            await vivadoRunScript(
                vscode.Uri.file('/workspace'),
                scriptPath,
                'checked-in-script',
                {
                    settings: makeSettings(),
                    platform: 'win32',
                },
            );
        } finally {
            cleanup();
        }

        const commandLine = (getTask()!.execution as vscode.ShellExecution).commandLine ?? '';
        assert.ok(commandLine.includes('-source'));
        assert.ok(commandLine.includes(scriptPath.fsPath));
    });

    test('task metadata uses the Vivado task source and provided task name', async () => {
        const { cleanup, getTask } = stubVivadoRunTasks(0);

        try {
            await vivadoRun(
                vscode.Uri.file('/workspace'),
                'exit',
                'custom-vivado-task',
                {
                    settings: makeSettings(),
                    platform: 'win32',
                },
            );
        } finally {
            cleanup();
        }

        assert.strictEqual(getTask()?.name, 'custom-vivado-task');
        assert.strictEqual(getTask()?.source, vivadoTaskSource);
    });

    test('resolves with the task exit code', async () => {
        const { cleanup } = stubVivadoRunTasks(17);

        let result: number | undefined;
        try {
            result = await vivadoRun(
                vscode.Uri.file('/workspace'),
                'exit',
                'exit-code-check',
                {
                    settings: makeSettings(),
                    platform: 'win32',
                },
            );
        } finally {
            cleanup();
        }

        assert.strictEqual(result, 17);
    });

    test('resolves with undefined when the task is cancelled', async () => {
        const { cleanup } = stubVivadoRunTasks(undefined);

        let result: number | undefined = 999;
        try {
            result = await vivadoRun(
                vscode.Uri.file('/workspace'),
                'exit',
                'cancel-check',
                {
                    settings: makeSettings(),
                    platform: 'win32',
                },
            );
        } finally {
            cleanup();
        }

        assert.strictEqual(result, undefined);
    });

    test('sets the working directory and Vivado PATH on the shell execution', async () => {
        const startPath = vscode.Uri.file('/workspace/project');
        const { cleanup, getTask } = stubVivadoRunTasks(0);

        try {
            await vivadoRun(
                startPath,
                'exit',
                'cwd-path-check',
                {
                    settings: makeSettings(),
                    platform: 'win32',
                },
            );
        } finally {
            cleanup();
        }

        const exec = getTask()!.execution as vscode.ShellExecution;
        assert.strictEqual((exec.options as any)?.cwd, startPath.fsPath);
        assert.ok(((exec.options as any)?.env?.PATH ?? '').includes('C:\\Xilinx\\Vivado\\2023.2\\bin'));
    });
});

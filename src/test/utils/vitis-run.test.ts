/**
 * Tests for the vitisRun helper.
 * Closes #30 – Test vitisRun task creation and cleanup.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { vitisRun } from '../../utils/vitis-run';

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Override vscode.workspace.getConfiguration to return a fake config that
 * provides the given vitisPath (or undefined when undefined is passed).
 */
function overrideVitisPathConfig(vitisPath: string | undefined): () => void {
    const orig = vscode.workspace.getConfiguration.bind(vscode.workspace);
    (vscode.workspace as any).getConfiguration = (section?: string) => {
        if (section === 'vitis-hls-ide') {
            return {
                get: (key: string) => key === 'vitisPath' ? vitisPath : undefined,
            };
        }
        return orig(section);
    };
    return () => {
        (vscode.workspace as any).getConfiguration = orig;
    };
}

/**
 * Sets up coordinated executeTask + onDidEndTaskProcess stubs so that
 * vitisRun's "e.execution.task === task" identity check resolves correctly.
 *
 * executeTask captures the task object and the synthetic task-end event fires
 * with that same object, satisfying the strict equality check inside vitisRun.
 *
 * Returns a cleanup function and a getter for the captured task.
 */
function stubVitisRunTasks(exitCode: number | undefined): {
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
            // Schedule AFTER the current synchronous frame so that vitisRun has
            // already registered its listener before the event fires.
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

// ── vitisRun – missing configuration ──────────────────────────────────────

suite('vitisRun', () => {

    test('throws when vitisPath is not configured', async () => {
        const restore = overrideVitisPathConfig(undefined);
        try {
            await assert.rejects(
                () => vitisRun(vscode.Uri.file('/workspace'), 'exit', 'test-task'),
                /Vitis path not set/
            );
        } finally {
            restore();
        }
    });

    test('throws when vitisPath is an empty string', async () => {
        const restore = overrideVitisPathConfig('');
        try {
            await assert.rejects(
                () => vitisRun(vscode.Uri.file('/workspace'), 'exit', 'test-task'),
                /Vitis path not set/
            );
        } finally {
            restore();
        }
    });

    // ── TCL file creation ────────────────────────────────────────────────────

    test('writes the TCL content to a temp file before executing the task', async () => {
        const expectedTcl = 'open_project proj\nexit';

        // Capture the shell command INSIDE executeTask – at that moment the file
        // has already been written and not yet deleted (deletion is async).
        let capturedTask: vscode.Task | undefined;
        let tclFilePath: string | undefined;
        let tclFileContent: string | undefined;

        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');

        const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
        Object.defineProperty(vscode.tasks, 'executeTask', {
            value: (task: vscode.Task) => {
                capturedTask = task;
                const cmd = (task.execution as vscode.ShellExecution).commandLine ?? '';
                const match = cmd.match(/--tcl\s+(\S+)/);
                if (match) {
                    tclFilePath = match[1];
                    try { tclFileContent = fs.readFileSync(tclFilePath, 'utf8'); } catch { /* ignore */ }
                }
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
                        handler({ execution: { task: capturedTask } as unknown as vscode.TaskExecution, exitCode: 0 });
                    }
                });
                return { dispose: () => { /* no-op */ } };
            },
            configurable: true,
            writable: true,
        });

        try {
            await vitisRun(vscode.Uri.file('/workspace'), expectedTcl, 'tcl-content-check');
        } finally {
            restoreConfig();
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
            if (origEndTask) { Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', origEndTask); }
        }

        assert.ok(tclFilePath, 'Shell command must include a --tcl <path>');
        assert.ok(
            path.basename(tclFilePath!).startsWith('vitis-hls-ide-tcl-'),
            'TCL temp file name must match the naming convention'
        );
        assert.ok(
            tclFilePath!.startsWith(os.tmpdir()),
            'TCL temp file must reside in the OS temp directory'
        );
        assert.strictEqual(tclFileContent, expectedTcl, 'TCL file must contain the provided TCL content');
    });

    test('task shell command includes --mode hls --tcl and the temp file path', async () => {
        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');
        const { cleanup, getTask } = stubVitisRunTasks(0);

        try {
            await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'check-command');
        } finally {
            restoreConfig();
            cleanup();
        }

        const capturedTask = getTask();
        assert.ok(capturedTask, 'executeTask must have been called');
        const exec = capturedTask!.execution as vscode.ShellExecution;
        const cmd = typeof exec.commandLine === 'string' ? exec.commandLine : '';
        assert.ok(cmd.includes('vitis-run'), 'Shell command must include vitis-run');
        assert.ok(cmd.includes('--mode hls'), 'Shell command must include --mode hls');
        assert.ok(cmd.includes('--tcl'), 'Shell command must include --tcl');
    });

    test('task name matches the provided taskName argument', async () => {
        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');
        const { cleanup, getTask } = stubVitisRunTasks(0);

        try {
            await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'my-custom-task-name');
        } finally {
            restoreConfig();
            cleanup();
        }

        assert.strictEqual(getTask()?.name, 'my-custom-task-name');
    });

    test('task source is "Vitis HLS IDE"', async () => {
        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');
        const { cleanup, getTask } = stubVitisRunTasks(0);

        try {
            await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'source-check');
        } finally {
            restoreConfig();
            cleanup();
        }

        assert.strictEqual(getTask()?.source, 'Vitis HLS IDE');
    });

    test('resolves with the exit code returned by the task', async () => {
        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');
        const { cleanup } = stubVitisRunTasks(42);

        let result: number | undefined;
        try {
            result = await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'exit-code-check');
        } finally {
            restoreConfig();
            cleanup();
        }

        assert.strictEqual(result, 42, 'vitisRun should resolve with the task exit code');
    });

    test('resolves with undefined when the task exit code is undefined (cancellation)', async () => {
        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');
        const { cleanup } = stubVitisRunTasks(undefined);

        let result: number | undefined = 999;
        try {
            result = await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'cancellation-check');
        } finally {
            restoreConfig();
            cleanup();
        }

        assert.strictEqual(result, undefined, 'vitisRun should resolve with undefined for cancellation');
    });

    test('PATH env variable includes the Vitis bin directory', async () => {
        const vitisPath = '/opt/Xilinx/Vitis/2023.2';
        const restoreConfig = overrideVitisPathConfig(vitisPath);
        const { cleanup, getTask } = stubVitisRunTasks(0);

        try {
            await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'path-check');
        } finally {
            restoreConfig();
            cleanup();
        }

        const exec = getTask()!.execution as vscode.ShellExecution;
        const envPath: string = (exec.options as any)?.env?.PATH ?? '';
        assert.ok(envPath.includes(path.join(vitisPath, 'bin')), 'PATH must include the Vitis bin directory');
    });

    test('working directory is set to the provided startPath', async () => {
        const startPath = vscode.Uri.file('/workspace/myproject');
        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');
        const { cleanup, getTask } = stubVitisRunTasks(0);

        try {
            await vitisRun(startPath, 'exit', 'cwd-check');
        } finally {
            restoreConfig();
            cleanup();
        }

        const exec = getTask()!.execution as vscode.ShellExecution;
        assert.strictEqual(
            (exec.options as any)?.cwd,
            startPath.fsPath,
            'Working directory must match the provided startPath'
        );
    });
});

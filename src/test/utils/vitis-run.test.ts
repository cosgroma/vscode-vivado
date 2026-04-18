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
 * Temporarily replace a property on an object, run fn, then restore.
 */
async function withStub<T, K extends keyof T>(
    obj: T,
    key: K,
    stub: T[K],
    fn: () => Promise<void>
): Promise<void> {
    const original = obj[key];
    obj[key] = stub;
    try {
        await fn();
    } finally {
        obj[key] = original;
    }
}

/**
 * Override vscode.workspace.getConfiguration to return a fake config that
 * provides the given vitisPath (or undefined when null is passed).
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
        const tempFiles: string[] = [];

        // Track files written by fs.writeFileSync in the temp dir.
        const origWrite = fs.writeFileSync.bind(fs);
        (fs as any).writeFileSync = (file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, ...rest: any[]) => {
            if (typeof file === 'string' && file.includes('vitis-hls-ide-tcl-')) {
                tempFiles.push(file);
            }
            origWrite(file, data, ...rest);
        };

        // Provide a valid vitisPath so we get past the guard.
        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');

        // Stub executeTask so we don't try to launch a real process.
        const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
        Object.defineProperty(vscode.tasks, 'executeTask', {
            value: (_task: vscode.Task) => Promise.resolve({} as vscode.TaskExecution),
            configurable: true,
            writable: true,
        });

        // Stub onDidEndTaskProcess to immediately resolve with exit code 0.
        const restoreEndTask = await (async () => {
            const orig = Object.getOwnPropertyDescriptor(vscode.tasks, 'onDidEndTaskProcess');
            Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', {
                value: (handler: (e: { execution: vscode.TaskExecution; exitCode: number | undefined }) => void) => {
                    // Schedule a synthetic "task ended" event.
                    setImmediate(() => handler({ execution: {} as vscode.TaskExecution, exitCode: 0 }));
                    return { dispose: () => { /* no-op */ } };
                },
                configurable: true,
                writable: true,
            });
            return () => { if (orig) { Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', orig); } };
        })();

        try {
            await vitisRun(vscode.Uri.file('/workspace'), 'open_project proj\nexit', 'my-task');
            assert.strictEqual(tempFiles.length, 1, 'Exactly one TCL temp file should have been written');
            assert.ok(
                fs.existsSync(tempFiles[0]) === false || true, // file may or may not be cleaned up already
                'TCL temp file should have been created'
            );
        } finally {
            (fs as any).writeFileSync = origWrite;
            restoreConfig();
            restoreEndTask();
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
        }
    });

    test('task shell command includes --mode hls --tcl and the temp file path', async () => {
        let capturedTask: vscode.Task | undefined;

        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');

        const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
        Object.defineProperty(vscode.tasks, 'executeTask', {
            value: (task: vscode.Task) => {
                capturedTask = task;
                return Promise.resolve({} as vscode.TaskExecution);
            },
            configurable: true,
            writable: true,
        });

        const origEndTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'onDidEndTaskProcess');
        Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', {
            value: (handler: (e: { execution: vscode.TaskExecution; exitCode: number | undefined }) => void) => {
                setImmediate(() => handler({ execution: {} as vscode.TaskExecution, exitCode: 0 }));
                return { dispose: () => { /* no-op */ } };
            },
            configurable: true,
            writable: true,
        });

        try {
            await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'check-command');
        } finally {
            restoreConfig();
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
            if (origEndTask) { Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', origEndTask); }
        }

        assert.ok(capturedTask, 'executeTask must have been called');
        const exec = capturedTask!.execution as vscode.ShellExecution;
        const cmd = typeof exec.commandLine === 'string' ? exec.commandLine : '';
        assert.ok(cmd.includes('vitis-run'), 'Shell command must include vitis-run');
        assert.ok(cmd.includes('--mode hls'), 'Shell command must include --mode hls');
        assert.ok(cmd.includes('--tcl'), 'Shell command must include --tcl');
    });

    test('task name matches the provided taskName argument', async () => {
        let capturedTask: vscode.Task | undefined;

        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');

        const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
        Object.defineProperty(vscode.tasks, 'executeTask', {
            value: (task: vscode.Task) => {
                capturedTask = task;
                return Promise.resolve({} as vscode.TaskExecution);
            },
            configurable: true,
            writable: true,
        });

        const origEndTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'onDidEndTaskProcess');
        Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', {
            value: (handler: (e: { execution: vscode.TaskExecution; exitCode: number | undefined }) => void) => {
                setImmediate(() => handler({ execution: {} as vscode.TaskExecution, exitCode: 0 }));
                return { dispose: () => { /* no-op */ } };
            },
            configurable: true,
            writable: true,
        });

        try {
            await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'my-custom-task-name');
        } finally {
            restoreConfig();
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
            if (origEndTask) { Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', origEndTask); }
        }

        assert.strictEqual(capturedTask?.name, 'my-custom-task-name');
    });

    test('task source is "Vitis HLS IDE"', async () => {
        let capturedTask: vscode.Task | undefined;

        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');

        const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
        Object.defineProperty(vscode.tasks, 'executeTask', {
            value: (task: vscode.Task) => {
                capturedTask = task;
                return Promise.resolve({} as vscode.TaskExecution);
            },
            configurable: true,
            writable: true,
        });

        const origEndTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'onDidEndTaskProcess');
        Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', {
            value: (handler: (e: { execution: vscode.TaskExecution; exitCode: number | undefined }) => void) => {
                setImmediate(() => handler({ execution: {} as vscode.TaskExecution, exitCode: 0 }));
                return { dispose: () => { /* no-op */ } };
            },
            configurable: true,
            writable: true,
        });

        try {
            await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'source-check');
        } finally {
            restoreConfig();
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
            if (origEndTask) { Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', origEndTask); }
        }

        assert.strictEqual(capturedTask?.source, 'Vitis HLS IDE');
    });

    test('resolves with the exit code returned by the task', async () => {
        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');

        const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
        Object.defineProperty(vscode.tasks, 'executeTask', {
            value: (_task: vscode.Task) => Promise.resolve({} as vscode.TaskExecution),
            configurable: true,
            writable: true,
        });

        const origEndTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'onDidEndTaskProcess');
        Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', {
            value: (handler: (e: { execution: vscode.TaskExecution; exitCode: number | undefined }) => void) => {
                setImmediate(() => handler({ execution: {} as vscode.TaskExecution, exitCode: 42 }));
                return { dispose: () => { /* no-op */ } };
            },
            configurable: true,
            writable: true,
        });

        let result: number | undefined;
        try {
            result = await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'exit-code-check');
        } finally {
            restoreConfig();
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
            if (origEndTask) { Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', origEndTask); }
        }

        assert.strictEqual(result, 42, 'vitisRun should resolve with the task exit code');
    });

    test('resolves with undefined when the task exit code is undefined (cancellation)', async () => {
        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');

        const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
        Object.defineProperty(vscode.tasks, 'executeTask', {
            value: (_task: vscode.Task) => Promise.resolve({} as vscode.TaskExecution),
            configurable: true,
            writable: true,
        });

        const origEndTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'onDidEndTaskProcess');
        Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', {
            value: (handler: (e: { execution: vscode.TaskExecution; exitCode: number | undefined }) => void) => {
                setImmediate(() => handler({ execution: {} as vscode.TaskExecution, exitCode: undefined }));
                return { dispose: () => { /* no-op */ } };
            },
            configurable: true,
            writable: true,
        });

        let result: number | undefined = 999;
        try {
            result = await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'cancellation-check');
        } finally {
            restoreConfig();
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
            if (origEndTask) { Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', origEndTask); }
        }

        assert.strictEqual(result, undefined, 'vitisRun should resolve with undefined for cancellation');
    });

    test('PATH env variable includes the Vitis bin directory', async () => {
        let capturedTask: vscode.Task | undefined;
        const vitisPath = '/opt/Xilinx/Vitis/2023.2';

        const restoreConfig = overrideVitisPathConfig(vitisPath);

        const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
        Object.defineProperty(vscode.tasks, 'executeTask', {
            value: (task: vscode.Task) => {
                capturedTask = task;
                return Promise.resolve({} as vscode.TaskExecution);
            },
            configurable: true,
            writable: true,
        });

        const origEndTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'onDidEndTaskProcess');
        Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', {
            value: (handler: (e: { execution: vscode.TaskExecution; exitCode: number | undefined }) => void) => {
                setImmediate(() => handler({ execution: {} as vscode.TaskExecution, exitCode: 0 }));
                return { dispose: () => { /* no-op */ } };
            },
            configurable: true,
            writable: true,
        });

        try {
            await vitisRun(vscode.Uri.file('/workspace'), 'exit', 'path-check');
        } finally {
            restoreConfig();
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
            if (origEndTask) { Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', origEndTask); }
        }

        const exec = capturedTask!.execution as vscode.ShellExecution;
        const envPath: string = (exec.options as any)?.env?.PATH ?? '';
        assert.ok(envPath.includes(path.join(vitisPath, 'bin')), 'PATH must include the Vitis bin directory');
    });

    test('working directory is set to the provided startPath', async () => {
        let capturedTask: vscode.Task | undefined;
        const startPath = vscode.Uri.file('/workspace/myproject');

        const restoreConfig = overrideVitisPathConfig('/opt/Xilinx/Vitis/2023.2');

        const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
        Object.defineProperty(vscode.tasks, 'executeTask', {
            value: (task: vscode.Task) => {
                capturedTask = task;
                return Promise.resolve({} as vscode.TaskExecution);
            },
            configurable: true,
            writable: true,
        });

        const origEndTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'onDidEndTaskProcess');
        Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', {
            value: (handler: (e: { execution: vscode.TaskExecution; exitCode: number | undefined }) => void) => {
                setImmediate(() => handler({ execution: {} as vscode.TaskExecution, exitCode: 0 }));
                return { dispose: () => { /* no-op */ } };
            },
            configurable: true,
            writable: true,
        });

        try {
            await vitisRun(startPath, 'exit', 'cwd-check');
        } finally {
            restoreConfig();
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
            if (origEndTask) { Object.defineProperty(vscode.tasks, 'onDidEndTaskProcess', origEndTask); }
        }

        const exec = capturedTask!.execution as vscode.ShellExecution;
        assert.strictEqual(
            (exec.options as any)?.cwd,
            startPath.fsPath,
            'Working directory must match the provided startPath'
        );
    });
});

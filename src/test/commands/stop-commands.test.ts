/**
 * Tests for HLS stop command behavior (stop-csim, stop-csynth, stop-cosim).
 * Closes #29 – Test HLS stop command behavior.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { HLSProject } from '../../models/hls-project';
import { HLSProjectSolution } from '../../models/hls-project-solution';
import stopCsim from '../../commands/project/run/projects-stop-csim';
import stopCsynth from '../../commands/project/run/projects-stop-csynth';
import stopCosim from '../../commands/project/run/projects-stop-cosim';

// ── helpers ────────────────────────────────────────────────────────────────

function makeProject(name: string): HLSProject {
    const uri = vscode.Uri.file(`/workspace/${name}/hls.app`);
    return new HLSProject(uri, name, 'top');
}

function makeSolution(name: string): HLSProjectSolution {
    return new HLSProjectSolution(name);
}

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
 * Override vscode.tasks.taskExecutions with a controllable getter and return a
 * restore function.
 */
function overrideTaskExecutions(executions: vscode.TaskExecution[]): () => void {
    const orig = Object.getOwnPropertyDescriptor(vscode.tasks, 'taskExecutions');
    Object.defineProperty(vscode.tasks, 'taskExecutions', {
        get: () => executions,
        configurable: true,
    });
    return () => {
        if (orig) { Object.defineProperty(vscode.tasks, 'taskExecutions', orig); }
    };
}

/**
 * Build a fake TaskExecution whose task.name matches the given name.
 */
function makeFakeExecution(taskName: string): vscode.TaskExecution {
    let terminated = false;
    return {
        task: {
            source: 'Vitis HLS IDE',
            name: taskName,
            definition: { type: 'shell' },
            scope: vscode.TaskScope.Workspace,
            isBackground: false,
            presentationOptions: {},
            problemMatchers: [],
            runOptions: {},
            group: undefined,
        } as unknown as vscode.Task,
        terminate: () => { terminated = true; },
        get _terminated() { return terminated; },
    } as unknown as vscode.TaskExecution & { _terminated: boolean };
}

// ── stopCsim ───────────────────────────────────────────────────────────────

suite('stopCsim command', () => {

    test('returns quietly when no matching build task is running', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');
        const restore = overrideTaskExecutions([]);
        try {
            // Should resolve without throwing even when there is nothing to stop.
            await stopCsim(project, solution);
        } finally {
            restore();
        }
    });

    test('terminates the matching build task', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');
        const taskName = solution.buildCsimTaskName(project);
        const fakeExec = makeFakeExecution(taskName);
        const restore = overrideTaskExecutions([fakeExec]);

        try {
            await withStub(
                vscode.tasks as any,
                'onDidEndTaskProcess',
                // Stub the listener registration so we don't hang waiting for an event.
                (_handler: any) => ({ dispose: () => { /* no-op */ } }),
                async () => { await stopCsim(project, solution); }
            );
        } finally {
            restore();
        }

        assert.strictEqual(
            (fakeExec as any)._terminated,
            true,
            'terminate() must be called on the matching task execution'
        );
    });

    test('stops an active debug session matching the debug task name', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');
        const debugName = solution.debugCsimTaskName(project);

        // Simulate an active debug session with the correct name.
        const origDescriptor = Object.getOwnPropertyDescriptor(vscode.debug, 'activeDebugSession');
        Object.defineProperty(vscode.debug, 'activeDebugSession', {
            get: () => ({ name: debugName }),
            configurable: true,
        });

        let stopDebuggingCalled = false;
        const restore = overrideTaskExecutions([]);
        try {
            await withStub(
                vscode.debug as any,
                'stopDebugging',
                async () => { stopDebuggingCalled = true; },
                async () => { await stopCsim(project, solution); }
            );
        } finally {
            restore();
            if (origDescriptor) { Object.defineProperty(vscode.debug, 'activeDebugSession', origDescriptor); }
        }

        assert.strictEqual(stopDebuggingCalled, true, 'stopDebugging must be called when debug session matches');
    });
});

// ── stopCsynth ─────────────────────────────────────────────────────────────

suite('stopCsynth command', () => {

    test('returns quietly when no matching task is running', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');
        const restore = overrideTaskExecutions([]);
        try {
            await stopCsynth(project, solution);
        } finally {
            restore();
        }
    });

    test('terminates the matching csynth task', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');
        const taskName = solution.csynthTaskName(project);
        const fakeExec = makeFakeExecution(taskName);
        const restore = overrideTaskExecutions([fakeExec]);

        try {
            await withStub(
                vscode.tasks as any,
                'onDidEndTaskProcess',
                (_handler: any) => ({ dispose: () => { /* no-op */ } }),
                async () => { await stopCsynth(project, solution); }
            );
        } finally {
            restore();
        }

        assert.strictEqual((fakeExec as any)._terminated, true);
    });
});

// ── stopCosim ──────────────────────────────────────────────────────────────

suite('stopCosim command', () => {

    test('returns quietly when no matching task is running', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');
        const restore = overrideTaskExecutions([]);
        try {
            await stopCosim(project, solution);
        } finally {
            restore();
        }
    });

    test('terminates the matching cosim task', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');
        const taskName = solution.cosimTaskName(project);
        const fakeExec = makeFakeExecution(taskName);
        const restore = overrideTaskExecutions([fakeExec]);

        try {
            await withStub(
                vscode.tasks as any,
                'onDidEndTaskProcess',
                (_handler: any) => ({ dispose: () => { /* no-op */ } }),
                async () => { await stopCosim(project, solution); }
            );
        } finally {
            restore();
        }

        assert.strictEqual((fakeExec as any)._terminated, true);
    });
});

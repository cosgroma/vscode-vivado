/**
 * Tests for HLS run command orchestration (csim, csynth, cosim).
 * Closes #28 – Test HLS run command orchestration.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { HLSProject } from '../../models/hls-project';
import { HLSProjectSolution } from '../../models/hls-project-solution';
import runCsim from '../../commands/project/run/projects-run-csim';
import runCsynth from '../../commands/project/run/projects-run-csynth';
import runCosim from '../../commands/project/run/projects-run-cosim';
import { taskSource } from '../../constants';

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
 * Build a minimal fake TaskExecution whose task.source matches the extension's
 * taskSource constant so that the "task already running" guard triggers.
 */
function makeFakeTaskExecution(): vscode.TaskExecution {
    return {
        task: {
            source: taskSource,
            name: 'fake-task',
            definition: { type: 'shell' },
            scope: vscode.TaskScope.Workspace,
            isBackground: false,
            presentationOptions: {},
            problemMatchers: [],
            runOptions: {},
            group: undefined,
        } as unknown as vscode.Task,
        terminate: () => { /* no-op */ },
    } as unknown as vscode.TaskExecution;
}

// ── runCsim ────────────────────────────────────────────────────────────────

suite('runCsim command', () => {

    test('shows error and returns when another extension task is already running', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');

        let errorShown = false;
        await withStub(
            vscode.window as any,
            'showErrorMessage',
            async () => { errorShown = true; return undefined; },
            async () => {
                // Override taskExecutions to include a running extension task.
                const origExecutions = Object.getOwnPropertyDescriptor(vscode.tasks, 'taskExecutions');
                Object.defineProperty(vscode.tasks, 'taskExecutions', {
                    get: () => [makeFakeTaskExecution()],
                    configurable: true,
                });
                try {
                    await runCsim(project, solution);
                } finally {
                    if (origExecutions) {
                        Object.defineProperty(vscode.tasks, 'taskExecutions', origExecutions);
                    }
                }
            }
        );

        assert.strictEqual(errorShown, true, 'An error message must be shown when a task is already running');
    });

    test('does not proceed to vitisRun when a task is already running', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');

        let executeTaskCalled = false;
        const origExecuteTask = Object.getOwnPropertyDescriptor(vscode.tasks, 'executeTask');
        Object.defineProperty(vscode.tasks, 'executeTask', {
            value: async () => { executeTaskCalled = true; },
            configurable: true,
            writable: true,
        });
        const origExecutions = Object.getOwnPropertyDescriptor(vscode.tasks, 'taskExecutions');
        Object.defineProperty(vscode.tasks, 'taskExecutions', {
            get: () => [makeFakeTaskExecution()],
            configurable: true,
        });

        try {
            await withStub(
                vscode.window as any,
                'showErrorMessage',
                async () => undefined,
                async () => { await runCsim(project, solution); }
            );
        } finally {
            if (origExecutions) { Object.defineProperty(vscode.tasks, 'taskExecutions', origExecutions); }
            if (origExecuteTask) { Object.defineProperty(vscode.tasks, 'executeTask', origExecuteTask); }
        }

        assert.strictEqual(executeTaskCalled, false, 'executeTask must not be called when blocked');
    });
});

// ── runCsynth ──────────────────────────────────────────────────────────────

suite('runCsynth command', () => {

    test('shows error and returns when another extension task is already running', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');

        let errorShown = false;
        const origExecutions = Object.getOwnPropertyDescriptor(vscode.tasks, 'taskExecutions');
        Object.defineProperty(vscode.tasks, 'taskExecutions', {
            get: () => [makeFakeTaskExecution()],
            configurable: true,
        });

        try {
            await withStub(
                vscode.window as any,
                'showErrorMessage',
                async () => { errorShown = true; return undefined; },
                async () => { await runCsynth(project, solution); }
            );
        } finally {
            if (origExecutions) { Object.defineProperty(vscode.tasks, 'taskExecutions', origExecutions); }
        }

        assert.strictEqual(errorShown, true);
    });
});

// ── runCosim ───────────────────────────────────────────────────────────────

suite('runCosim command', () => {

    test('shows error and returns when another extension task is already running', async () => {
        const project = makeProject('proj');
        const solution = makeSolution('sol');

        let errorShown = false;
        const origExecutions = Object.getOwnPropertyDescriptor(vscode.tasks, 'taskExecutions');
        Object.defineProperty(vscode.tasks, 'taskExecutions', {
            get: () => [makeFakeTaskExecution()],
            configurable: true,
        });

        try {
            await withStub(
                vscode.window as any,
                'showErrorMessage',
                async () => { errorShown = true; return undefined; },
                async () => { await runCosim(project, solution); }
            );
        } finally {
            if (origExecutions) { Object.defineProperty(vscode.tasks, 'taskExecutions', origExecutions); }
        }

        assert.strictEqual(errorShown, true);
    });
});

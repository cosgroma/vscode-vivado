/**
 * Tests for extension activation, command registration, and C++ properties checks.
 * Closes #23 – Test extension activation, command registration, and C++ properties checks.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as ext from '../extension';
import { generateVivadoBitstreamCommandId } from '../commands/vivado/generate-bitstream';
import { openVivadoProjectCommandId } from '../commands/vivado/open-project';
import { previewVivadoGeneratedTclCommandId } from '../commands/vivado/preview-generated-tcl';
import { runVivadoImplementationCommandId } from '../commands/vivado/run-implementation';
import { runVivadoSynthesisCommandId } from '../commands/vivado/run-synthesis';

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

function makeFakeContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
        workspaceState: { get: () => undefined, update: async () => { /* no-op */ }, keys: () => [] },
        globalState: { get: () => undefined, update: async () => { /* no-op */ }, keys: () => [], setKeysForSync: () => { /* no-op */ } },
        extensionPath: '',
        extensionUri: vscode.Uri.file(''),
        environmentVariableCollection: {} as any,
        asAbsolutePath: (p: string) => p,
        storageUri: undefined,
        storagePath: undefined,
        globalStorageUri: vscode.Uri.file(''),
        globalStoragePath: '',
        logUri: vscode.Uri.file(''),
        logPath: '',
        extensionMode: vscode.ExtensionMode.Test,
        extension: {} as any,
        secrets: {} as any,
        languageModelAccessInformation: {} as any,
    };
}

// ── basic sanity ───────────────────────────────────────────────────────────

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Sample test', () => {
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });
});

// ── package.json activation events ────────────────────────────────────────

suite('Package activation events', () => {

    let activationEvents: string[];

    suiteSetup(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require('../../package.json') as { activationEvents: string[] };
        activationEvents = pkg.activationEvents ?? [];
    });

    test('activates on hls.app workspaces', () => {
        assert.ok(
            activationEvents.includes('workspaceContains:**/hls.app'),
            'package.json must declare workspaceContains:**/hls.app'
        );
    });

    test('activates on Vivado .xpr workspaces', () => {
        assert.ok(
            activationEvents.includes('workspaceContains:**/*.xpr'),
            'package.json must declare workspaceContains:**/*.xpr'
        );
    });
});

// ── activation ─────────────────────────────────────────────────────────────

suite('Extension activation', () => {

    test('extension can be activated without throwing', async () => {
        const fakeContext = makeFakeContext();
        await withStub(
            vscode.window as any,
            'showWarningMessage',
            async () => undefined,
            async () => {
                await assert.doesNotReject(async () => ext.activate(fakeContext));
            }
        );
    });

    test('deactivate does not throw', () => {
        assert.doesNotThrow(() => ext.deactivate());
    });

    test('registers the Vivado commands', async () => {
        const fakeContext = makeFakeContext();
        const registeredCommands: string[] = [];
        const origRegisterCommand = vscode.commands.registerCommand.bind(vscode.commands);
        (vscode.commands as any).registerCommand = (id: string, _handler: (...args: any[]) => any) => {
            registeredCommands.push(id);
            return { dispose: () => { /* no-op */ } };
        };

        try {
            await withStub(
                vscode.window as any,
                'showWarningMessage',
                async () => undefined,
                async () => {
                    ext.activate(fakeContext);
                }
            );
        } finally {
            (vscode.commands as any).registerCommand = origRegisterCommand;
        }

        assert.ok(registeredCommands.includes(openVivadoProjectCommandId));
        assert.ok(registeredCommands.includes(previewVivadoGeneratedTclCommandId));
        assert.ok(registeredCommands.includes(runVivadoSynthesisCommandId));
        assert.ok(registeredCommands.includes(runVivadoImplementationCommandId));
        assert.ok(registeredCommands.includes(generateVivadoBitstreamCommandId));
    });
});

// ── checkCppProperties – warning when hlsPath is empty ────────────────────

suite('Extension checkCppProperties', () => {

    test('shows a warning when the HLS path setting is empty', async () => {
        let warningShown = false;

        const origGetConfig = vscode.workspace.getConfiguration.bind(vscode.workspace);
        (vscode.workspace as any).getConfiguration = (section?: string) => {
            if (section === 'vitis-hls-ide') {
                return { get: (_key: string) => '' };
            }
            return origGetConfig(section);
        };

        // Stub registerCommand so re-activating doesn't throw "command already exists".
        const origRegisterCommand = vscode.commands.registerCommand.bind(vscode.commands);
        (vscode.commands as any).registerCommand = (_id: string, _handler: (...args: any[]) => any) => ({ dispose: () => { /* no-op */ } });

        try {
            await withStub(
                vscode.window as any,
                'showWarningMessage',
                async () => { warningShown = true; return undefined; },
                async () => {
                    ext.activate(makeFakeContext());
                    // Allow the microtask queue to flush so the async warning fires.
                    await new Promise<void>(resolve => setImmediate(resolve));
                    await new Promise<void>(resolve => setImmediate(resolve));
                }
            );
        } finally {
            (vscode.workspace as any).getConfiguration = origGetConfig;
            (vscode.commands as any).registerCommand = origRegisterCommand;
        }

        assert.strictEqual(warningShown, true, 'A warning must be shown when hlsPath is empty');
    });

    test('does not show a warning when the HLS path setting is set', async () => {
        let warningShown = false;

        const origGetConfig = vscode.workspace.getConfiguration.bind(vscode.workspace);
        (vscode.workspace as any).getConfiguration = (section?: string) => {
            if (section === 'vitis-hls-ide') {
                return { get: (_key: string) => '/opt/Xilinx/Vitis_HLS/2023.2' };
            }
            return origGetConfig(section);
        };

        // Stub registerCommand so re-activating doesn't throw "command already exists".
        const origRegisterCommand = vscode.commands.registerCommand.bind(vscode.commands);
        (vscode.commands as any).registerCommand = (_id: string, _handler: (...args: any[]) => any) => ({ dispose: () => { /* no-op */ } });

        try {
            await withStub(
                vscode.window as any,
                'showWarningMessage',
                async () => { warningShown = true; return undefined; },
                async () => {
                    ext.activate(makeFakeContext());
                    await new Promise<void>(resolve => setImmediate(resolve));
                    await new Promise<void>(resolve => setImmediate(resolve));
                }
            );
        } finally {
            (vscode.workspace as any).getConfiguration = origGetConfig;
            (vscode.commands as any).registerCommand = origRegisterCommand;
        }

        assert.strictEqual(warningShown, false, 'No warning should be shown when hlsPath is properly set');
    });
});

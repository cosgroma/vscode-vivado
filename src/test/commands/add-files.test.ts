/**
 * Tests for the add-files command (source and test bench).
 * Closes #27 – Test add/remove HLS project file commands.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { HLSProject } from '../../models/hls-project';
import addFiles from '../../commands/project/modify/add-files';

// ── helpers ────────────────────────────────────────────────────────────────

function makeProject(name: string): HLSProject {
    const uri = vscode.Uri.file(`/workspace/${name}/hls.app`);
    return new HLSProject(uri, name, 'top');
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

// ── addFiles ───────────────────────────────────────────────────────────────

suite('addFiles command', () => {

    test('returns early when the user cancels the file dialog (source)', async () => {
        const project = makeProject('proj');
        // Stub showOpenDialog to simulate cancellation.
        await withStub(
            vscode.window as any,
            'showOpenDialog',
            async () => undefined,
            async () => {
                // Should resolve without throwing even though no files are selected.
                await addFiles(project, false);
            }
        );
    });

    test('returns early when the user cancels the file dialog (test bench)', async () => {
        const project = makeProject('proj');
        await withStub(
            vscode.window as any,
            'showOpenDialog',
            async () => undefined,
            async () => {
                await addFiles(project, true);
            }
        );
    });

    test('open dialog uses canSelectMany=true', async () => {
        const project = makeProject('proj');
        let capturedOptions: vscode.OpenDialogOptions | undefined;
        await withStub(
            vscode.window as any,
            'showOpenDialog',
            async (opts: vscode.OpenDialogOptions) => {
                capturedOptions = opts;
                return undefined; // cancel
            },
            async () => {
                await addFiles(project, false);
            }
        );
        assert.strictEqual(capturedOptions?.canSelectMany, true);
    });

    test('open dialog label mentions "Source" for source files', async () => {
        const project = makeProject('proj');
        let capturedOptions: vscode.OpenDialogOptions | undefined;
        await withStub(
            vscode.window as any,
            'showOpenDialog',
            async (opts: vscode.OpenDialogOptions) => {
                capturedOptions = opts;
                return undefined;
            },
            async () => {
                await addFiles(project, false);
            }
        );
        assert.ok(capturedOptions?.openLabel?.toLowerCase().includes('source'));
    });

    test('open dialog label mentions "Test Bench" for test bench files', async () => {
        const project = makeProject('proj');
        let capturedOptions: vscode.OpenDialogOptions | undefined;
        await withStub(
            vscode.window as any,
            'showOpenDialog',
            async (opts: vscode.OpenDialogOptions) => {
                capturedOptions = opts;
                return undefined;
            },
            async () => {
                await addFiles(project, true);
            }
        );
        assert.ok(capturedOptions?.openLabel?.toLowerCase().includes('test bench'));
    });

    test('open dialog filters for C++ files', async () => {
        const project = makeProject('proj');
        let capturedOptions: vscode.OpenDialogOptions | undefined;
        await withStub(
            vscode.window as any,
            'showOpenDialog',
            async (opts: vscode.OpenDialogOptions) => {
                capturedOptions = opts;
                return undefined;
            },
            async () => {
                await addFiles(project, false);
            }
        );
        const extensions = Object.values(capturedOptions?.filters ?? {}).flat();
        assert.ok(extensions.includes('cpp'), 'filters should include cpp');
        assert.ok(extensions.includes('h'), 'filters should include h');
    });
});

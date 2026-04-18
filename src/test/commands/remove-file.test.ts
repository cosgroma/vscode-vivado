/**
 * Tests for the remove-file command.
 * Closes #27 – Test add/remove HLS project file commands.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { HLSProject } from '../../models/hls-project';
import removeFile from '../../commands/project/modify/remove-file';

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

function makeHlsAppXml(fileName: string, tb: boolean): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<project name="proj" top="top">
  <solutions>
    <solution name="sol" status="active"/>
  </solutions>
  <files>
    <file name="${fileName}" sc="0" tb="${tb ? '1' : '0'}" cflags="" csimflags="" blackbox="0"/>
  </files>
</project>`;
}

async function makeProjectOnDisk(tempDir: string, fileName: string, tb: boolean): Promise<{ project: HLSProject; fileUri: vscode.Uri }> {
    const projectDir = path.join(tempDir, 'proj');
    fs.mkdirSync(projectDir, { recursive: true });
    const hlsAppPath = path.join(projectDir, 'hls.app');
    fs.writeFileSync(hlsAppPath, makeHlsAppXml(fileName, tb));
    const project = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));

    // Compute the absolute path of the file being removed.
    const startPath = path.dirname(projectDir); // one level above project dir
    const absFilePath = tb
        ? path.join(startPath, fileName.replace('../../', ''))
        : path.join(projectDir, '..', fileName);

    return { project, fileUri: vscode.Uri.file(path.normalize(absFilePath)) };
}

// ── removeFile ─────────────────────────────────────────────────────────────

suite('removeFile command', () => {
    let tempDir: string;

    setup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remove-file-test-'));
    });

    teardown(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('returns early when the user does not confirm (source file)', async () => {
        const { project, fileUri } = await makeProjectOnDisk(tempDir, 'src/main.cpp', false);

        // Stub the confirmation dialog to return undefined (cancel).
        await withStub(
            vscode.window as any,
            'showInformationMessage',
            async () => undefined,
            async () => {
                await removeFile(project, fileUri, false);
            }
        );

        // The hls.app file should be unchanged – the file entry is still there.
        const data = fs.readFileSync(path.join(tempDir, 'proj', 'hls.app'), 'utf8');
        assert.ok(data.includes('main.cpp'), 'File entry must not be removed when user cancels');
    });

    test('returns early when the user does not confirm (test bench file)', async () => {
        const { project, fileUri } = await makeProjectOnDisk(tempDir, '../../tb/tb_main.cpp', true);

        await withStub(
            vscode.window as any,
            'showInformationMessage',
            async () => undefined,
            async () => {
                await removeFile(project, fileUri, true);
            }
        );

        const data = fs.readFileSync(path.join(tempDir, 'proj', 'hls.app'), 'utf8');
        assert.ok(data.includes('tb_main.cpp'));
    });

    test('confirmation dialog is shown with the file name and project name', async () => {
        const { project, fileUri } = await makeProjectOnDisk(tempDir, 'src/my_module.cpp', false);

        let dialogMessage = '';
        await withStub(
            vscode.window as any,
            'showInformationMessage',
            async (msg: string) => {
                dialogMessage = msg;
                return undefined; // cancel
            },
            async () => {
                await removeFile(project, fileUri, false);
            }
        );

        assert.ok(dialogMessage.includes('my_module.cpp'), 'Dialog should mention file name');
        assert.ok(dialogMessage.includes('proj'), 'Dialog should mention project name');
    });

    test('removes source file entry from hls.app when confirmed', async () => {
        const { project, fileUri } = await makeProjectOnDisk(tempDir, 'src/main.cpp', false);

        await withStub(
            vscode.window as any,
            'showInformationMessage',
            async () => ({ title: 'OK' }) as vscode.MessageItem,
            async () => {
                // Also stub the commands and info messages that fire after removal.
                await withStub(
                    vscode.commands as any,
                    'executeCommand',
                    async () => undefined,
                    async () => {
                        await removeFile(project, fileUri, false);
                    }
                );
            }
        );

        const data = fs.readFileSync(path.join(tempDir, 'proj', 'hls.app'), 'utf8');
        assert.ok(!data.includes('main.cpp'), 'Source file entry should be removed from hls.app');
    });

    test('removes test bench file entry from hls.app when confirmed', async () => {
        const { project, fileUri } = await makeProjectOnDisk(tempDir, '../../tb/tb_main.cpp', true);

        await withStub(
            vscode.window as any,
            'showInformationMessage',
            async () => ({ title: 'OK' }) as vscode.MessageItem,
            async () => {
                await withStub(
                    vscode.commands as any,
                    'executeCommand',
                    async () => undefined,
                    async () => {
                        await removeFile(project, fileUri, true);
                    }
                );
            }
        );

        const data = fs.readFileSync(path.join(tempDir, 'proj', 'hls.app'), 'utf8');
        assert.ok(!data.includes('tb_main.cpp'), 'Test bench file entry should be removed from hls.app');
    });

    test('does not delete the original file from disk when removing a source entry', async () => {
        const { project, fileUri } = await makeProjectOnDisk(tempDir, 'src/main.cpp', false);

        // Create the physical source file so we can verify it is NOT deleted.
        const physicalPath = path.join(tempDir, 'proj', 'src', 'main.cpp');
        fs.mkdirSync(path.dirname(physicalPath), { recursive: true });
        fs.writeFileSync(physicalPath, '// placeholder');

        await withStub(
            vscode.window as any,
            'showInformationMessage',
            async () => ({ title: 'OK' }) as vscode.MessageItem,
            async () => {
                await withStub(
                    vscode.commands as any,
                    'executeCommand',
                    async () => undefined,
                    async () => {
                        await removeFile(project, fileUri, false);
                    }
                );
            }
        );

        assert.ok(fs.existsSync(physicalPath), 'Original source file must NOT be deleted');
    });
});

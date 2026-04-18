/**
 * Tests for HLSProject model (fromFile, constructor, update).
 * Closes #24 – Test HLS project XML parsing and model behavior.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { HLSProject } from '../../models/hls-project';

// Minimal hls.app XML used across tests.
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<project name="ignored_attr" top="my_top">
  <solutions>
    <solution name="solution1" status="active"/>
    <solution name="solution2" status="inactive"/>
  </solutions>
  <files>
    <file name="src/main.cpp"           sc="0" tb="0" cflags="-O2" csimflags=""   blackbox="0"/>
    <file name="../../tb/tb_main.cpp"   sc="0" tb="1" cflags=""    csimflags="-g" blackbox="0"/>
  </files>
</project>`;

// XML with only one solution and one source file.
const MINIMAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<project name="mini" top="func">
  <solutions>
    <solution name="sol" status="active"/>
  </solutions>
  <files>
    <file name="src/a.cpp" sc="0" tb="0" cflags="" csimflags="" blackbox="0"/>
  </files>
</project>`;

suite('HLSProject', () => {
    let tempDir: string;
    let hlsAppPath: string;

    setup(() => {
        // Create a fresh temp project directory for every test.
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-proj-test-'));
        const projectDir = path.join(tempDir, 'myproject');
        fs.mkdirSync(projectDir);
        hlsAppPath = path.join(projectDir, 'hls.app');
        fs.writeFileSync(hlsAppPath, SAMPLE_XML);
    });

    teardown(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // ── fromFile ───────────────────────────────────────────────────────────

    test('fromFile derives project name from the directory containing hls.app', async () => {
        const project = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        assert.strictEqual(project.name, 'myproject');
    });

    test('fromFile reads top function from XML', async () => {
        const project = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        assert.strictEqual(project.top, 'my_top');
    });

    test('fromFile loads all solutions', async () => {
        const project = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        assert.strictEqual(project.solutions.length, 2);
    });

    test('fromFile maps solution names correctly', async () => {
        const project = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        const names = project.solutions.map(s => s.name).sort();
        assert.deepStrictEqual(names, ['solution1', 'solution2']);
    });

    test('fromFile loads all files', async () => {
        const project = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        assert.strictEqual(project.files.length, 2);
    });

    test('fromFile distinguishes source files from test bench files', async () => {
        const project = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        const src = project.files.filter(f => !f.tb);
        const tb = project.files.filter(f => f.tb);
        assert.strictEqual(src.length, 1);
        assert.strictEqual(tb.length, 1);
    });

    test('fromFile maps cflags on source file', async () => {
        const project = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        const srcFile = project.files.find(f => !f.tb);
        assert.strictEqual(srcFile?.cflags, '-O2');
    });

    test('fromFile maps csimflags on test bench file', async () => {
        const project = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        const tbFile = project.files.find(f => f.tb);
        assert.strictEqual(tbFile?.csimflags, '-g');
    });

    // ── constructor / URI ──────────────────────────────────────────────────

    test('constructor sets uri to parent directory of hls.app', async () => {
        const uri = vscode.Uri.file(hlsAppPath);
        const project = await HLSProject.fromFile(uri);
        const expected = vscode.Uri.joinPath(uri, '..').fsPath;
        assert.strictEqual(project.uri.fsPath, expected);
    });

    test('constructor accepts explicit solutions and files arrays', () => {
        const uri = vscode.Uri.file(hlsAppPath);
        const project = new HLSProject(uri, 'myproject', 'top');
        assert.strictEqual(project.solutions.length, 0);
        assert.strictEqual(project.files.length, 0);
    });

    // ── update ─────────────────────────────────────────────────────────────

    test('update replaces solutions with those from the new project', async () => {
        const original = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        assert.strictEqual(original.solutions.length, 2);

        // Write a minimal project and load it.
        const miniPath = path.join(path.dirname(hlsAppPath), 'hls.app');
        fs.writeFileSync(miniPath, MINIMAL_XML);
        const updated = await HLSProject.fromFile(vscode.Uri.file(miniPath));

        original.update(updated);
        assert.strictEqual(original.solutions.length, 1);
        assert.strictEqual(original.solutions[0].name, 'sol');
    });

    test('update replaces files with those from the new project', async () => {
        const original = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        assert.strictEqual(original.files.length, 2);

        const miniPath = path.join(path.dirname(hlsAppPath), 'hls.app');
        fs.writeFileSync(miniPath, MINIMAL_XML);
        const updated = await HLSProject.fromFile(vscode.Uri.file(miniPath));

        original.update(updated);
        assert.strictEqual(original.files.length, 1);
    });

    test('update sets the new URI', async () => {
        const original = await HLSProject.fromFile(vscode.Uri.file(hlsAppPath));
        const newUri = vscode.Uri.file('/other/place/hls.app');
        const replacement = new HLSProject(newUri, 'other', 'f');
        original.update(replacement);
        assert.strictEqual(original.uri.fsPath, vscode.Uri.joinPath(newUri, '..').fsPath);
    });
});

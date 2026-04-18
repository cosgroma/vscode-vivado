/**
 * Tests for HLSProjectFile model.
 * Closes #24 – Test HLS project XML parsing and model behavior.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { HLSProjectFile } from '../../models/hls-project-file';

suite('HLSProjectFile', () => {

    // ── fromJson ───────────────────────────────────────────────────────────

    test('fromJson parses source file attributes', () => {
        const json = { name: 'src/main.cpp', sc: '0', tb: '0', cflags: '-O2', csimflags: '', blackbox: '0' };
        const file = HLSProjectFile.fromJson(json);
        assert.strictEqual(file.name, 'src/main.cpp');
        assert.strictEqual(file.sc, '0');
        assert.strictEqual(file.tb, false);
        assert.strictEqual(file.cflags, '-O2');
        assert.strictEqual(file.csimflags, '');
        assert.strictEqual(file.blackbox, false);
    });

    test('fromJson parses test bench file (tb=1)', () => {
        const json = { name: '../../tb/tb_main.cpp', sc: '0', tb: '1', cflags: '', csimflags: '-g', blackbox: '0' };
        const file = HLSProjectFile.fromJson(json);
        assert.strictEqual(file.tb, true);
        assert.strictEqual(file.name, '../../tb/tb_main.cpp');
        assert.strictEqual(file.csimflags, '-g');
    });

    test('fromJson parses blackbox=1', () => {
        const json = { name: 'src/box.cpp', sc: '0', tb: '0', cflags: '', csimflags: '', blackbox: '1' };
        const file = HLSProjectFile.fromJson(json);
        assert.strictEqual(file.blackbox, true);
    });

    test('fromJson treats tb!=1 as false', () => {
        const json = { name: 'src/a.cpp', sc: '0', tb: '0', cflags: '', csimflags: '', blackbox: '0' };
        const file = HLSProjectFile.fromJson(json);
        assert.strictEqual(file.tb, false);
    });

    test('fromJson treats blackbox!=1 as false', () => {
        const json = { name: 'src/a.cpp', sc: '0', tb: '0', cflags: '', csimflags: '', blackbox: '0' };
        const file = HLSProjectFile.fromJson(json);
        assert.strictEqual(file.blackbox, false);
    });

    // ── constructor ────────────────────────────────────────────────────────

    test('constructor stores all fields', () => {
        const file = new HLSProjectFile('src/foo.cpp', '1', true, '-Wall', '-v', true);
        assert.strictEqual(file.name, 'src/foo.cpp');
        assert.strictEqual(file.sc, '1');
        assert.strictEqual(file.tb, true);
        assert.strictEqual(file.cflags, '-Wall');
        assert.strictEqual(file.csimflags, '-v');
        assert.strictEqual(file.blackbox, true);
    });

    // ── getUri ─────────────────────────────────────────────────────────────

    test('getUri for source file resolves relative to project parent', () => {
        const projectUri = vscode.Uri.file('/workspace/myproject');
        const file = new HLSProjectFile('src/main.cpp', '0', false, '', '', false);
        const uri = file.getUri(projectUri);
        assert.ok(uri.fsPath.replace(/\\/g, '/').includes('main.cpp'));
    });

    test('getUri for test bench file strips leading ../../', () => {
        const projectUri = vscode.Uri.file('/workspace/myproject');
        const file = new HLSProjectFile('../../tb/tb_main.cpp', '0', true, '', '', false);
        const uri = file.getUri(projectUri);
        // The ../../ prefix is stripped, so the result should include tb_main.cpp
        assert.ok(uri.fsPath.replace(/\\/g, '/').includes('tb_main.cpp'));
    });

    test('getUri for source file does not strip ../../', () => {
        const projectUri = vscode.Uri.file('/workspace/myproject');
        // A source file path that does NOT start with ../../ is joined directly
        const file = new HLSProjectFile('src/helper.cpp', '0', false, '', '', false);
        const uri = file.getUri(projectUri);
        assert.ok(uri.fsPath.replace(/\\/g, '/').includes('helper.cpp'));
    });
});

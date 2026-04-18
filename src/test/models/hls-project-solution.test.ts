/**
 * Tests for HLSProjectSolution model.
 * Closes #24 – Test HLS project XML parsing and model behavior.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { HLSProject } from '../../models/hls-project';
import { HLSProjectSolution } from '../../models/hls-project-solution';

suite('HLSProjectSolution', () => {

    // Helper: build a minimal HLSProject for task-name assertions.
    function makeProject(name: string): HLSProject {
        const uri = vscode.Uri.file(`/workspace/${name}/hls.app`);
        return new HLSProject(uri, name, 'top_func');
    }

    // ── fromJson ───────────────────────────────────────────────────────────

    test('fromJson creates solution with name', () => {
        const solution = HLSProjectSolution.fromJson({ name: 'solution1', status: 'active' });
        assert.strictEqual(solution.name, 'solution1');
    });

    test('fromJson creates active solution', () => {
        const solution = HLSProjectSolution.fromJson({ name: 'sol', status: 'active' });
        // no public status field to check; verify it doesn't throw
        assert.ok(solution instanceof HLSProjectSolution);
    });

    test('fromJson creates inactive solution', () => {
        const solution = HLSProjectSolution.fromJson({ name: 'sol_inactive', status: 'inactive' });
        assert.strictEqual(solution.name, 'sol_inactive');
    });

    // ── constructor default ────────────────────────────────────────────────

    test('constructor default status does not throw', () => {
        assert.doesNotThrow(() => new HLSProjectSolution('default_sol'));
    });

    // ── task name methods ──────────────────────────────────────────────────

    test('buildCsimTaskName contains solution name', () => {
        const project = makeProject('proj');
        const solution = new HLSProjectSolution('sol1');
        assert.ok(solution.buildCsimTaskName(project).includes('sol1'));
    });

    test('buildCsimTaskName contains project directory', () => {
        const project = makeProject('myproj');
        const solution = new HLSProjectSolution('sol1');
        assert.ok(solution.buildCsimTaskName(project).includes('myproj'));
    });

    test('debugCsimTaskName contains solution name', () => {
        const project = makeProject('proj');
        const solution = new HLSProjectSolution('sol2');
        assert.ok(solution.debugCsimTaskName(project).includes('sol2'));
    });

    test('debugCsimTaskName contains project directory', () => {
        const project = makeProject('debugproj');
        const solution = new HLSProjectSolution('sol2');
        assert.ok(solution.debugCsimTaskName(project).includes('debugproj'));
    });

    test('csynthTaskName contains solution name', () => {
        const project = makeProject('proj');
        const solution = new HLSProjectSolution('sol3');
        assert.ok(solution.csynthTaskName(project).includes('sol3'));
    });

    test('csynthTaskName contains project directory', () => {
        const project = makeProject('synthproj');
        const solution = new HLSProjectSolution('sol3');
        assert.ok(solution.csynthTaskName(project).includes('synthproj'));
    });

    test('cosimTaskName contains solution name', () => {
        const project = makeProject('proj');
        const solution = new HLSProjectSolution('sol4');
        assert.ok(solution.cosimTaskName(project).includes('sol4'));
    });

    test('cosimTaskName contains project directory', () => {
        const project = makeProject('cosimproj');
        const solution = new HLSProjectSolution('sol4');
        assert.ok(solution.cosimTaskName(project).includes('cosimproj'));
    });

    test('all four task names are distinct for same solution and project', () => {
        const project = makeProject('proj');
        const solution = new HLSProjectSolution('sol');
        const names = [
            solution.buildCsimTaskName(project),
            solution.debugCsimTaskName(project),
            solution.csynthTaskName(project),
            solution.cosimTaskName(project),
        ];
        const unique = new Set(names);
        assert.strictEqual(unique.size, 4, 'Each task name must be unique');
    });
});

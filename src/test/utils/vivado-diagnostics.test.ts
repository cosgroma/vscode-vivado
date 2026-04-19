import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    parseVivadoDiagnosticLine,
    parseVivadoDiagnosticLines,
    vivadoDiagnosticLinePattern,
} from '../../utils/vivado-diagnostics';

interface PackageProblemMatcher {
    name: string;
    owner: string;
    fileLocation: string;
    pattern: Array<{
        regexp: string;
        severity: number;
        code: number;
        message: number;
        file: number;
        line: number;
        column: number;
    }>;
}

function readFixtureLines(name: string): string[] {
    const fixturePath = path.resolve(__dirname, '../../../src/test/fixtures', name);
    return fs.readFileSync(fixturePath, 'utf8').trimEnd().split(/\r?\n/);
}

suite('Vivado diagnostics parsing', () => {
    test('parses file-backed Vivado diagnostics from fixture output', () => {
        const diagnostics = parseVivadoDiagnosticLines(readFixtureLines('vivado-diagnostics.log'));

        assert.strictEqual(diagnostics.length, 5);
        assert.deepStrictEqual(diagnostics[0], {
            severity: 'info',
            rawSeverity: 'INFO',
            code: 'Vivado 12-4895',
            message: 'Creating project',
            filePath: '/workspace/scripts/create_project.tcl',
            line: 5,
            column: undefined,
        });
        assert.deepStrictEqual(diagnostics[2], {
            severity: 'error',
            rawSeverity: 'ERROR',
            code: 'Place 30-574',
            message: 'Poor placement for routing between an IO pin and BUFG.',
            filePath: 'C:/work/fpga/constraints.xdc',
            line: 17,
            column: undefined,
        });
        assert.deepStrictEqual(diagnostics[3], {
            severity: 'warning',
            rawSeverity: 'CRITICAL WARNING',
            code: 'Route 35-39',
            message: 'The design did not meet timing',
            filePath: '/home/me/fpga/top.xdc',
            line: 21,
            column: 7,
        });
    });

    test('leaves non-file-specific Vivado messages unparsed', () => {
        assert.strictEqual(
            parseVivadoDiagnosticLine('ERROR: [DRC NSTD-1] Unspecified I/O Standard.'),
            undefined,
        );
        assert.strictEqual(
            parseVivadoDiagnosticLine('ERROR: [Vivado 12-1411] Cannot set LOC property of ports [led].'),
            undefined,
        );
    });

    test('rejects invalid file locations', () => {
        assert.strictEqual(
            parseVivadoDiagnosticLine('ERROR: [Synth 8-439] Invalid line [/workspace/src/top.sv:0]'),
            undefined,
        );
        assert.strictEqual(
            parseVivadoDiagnosticLine('WARNING: [Vivado 12-999] Invalid column [/workspace/top.xdc:3:0]'),
            undefined,
        );
    });

    test('package.json contributes the Vivado problem matcher used by tasks', () => {
        const pkg = require('../../../package.json') as {
            contributes: { problemMatchers: PackageProblemMatcher[] };
        };
        const matcher = pkg.contributes.problemMatchers.find(item => item.name === 'vscode-vivado-vivado');

        assert.ok(matcher, 'package.json must contribute vscode-vivado-vivado');
        assert.strictEqual(matcher.owner, 'vscode-vivado');
        assert.strictEqual(matcher.fileLocation, 'absolute');
        assert.strictEqual(matcher.pattern.length, 1);
        assert.deepStrictEqual(matcher.pattern[0], {
            regexp: vivadoDiagnosticLinePattern.source,
            severity: 2,
            code: 3,
            message: 4,
            file: 5,
            line: 6,
            column: 7,
        });
    });
});

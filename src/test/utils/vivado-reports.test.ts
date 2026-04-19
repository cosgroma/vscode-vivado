import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoReportKind } from '../../models/vivado-report';
import { VivadoRun, VivadoRunType } from '../../models/vivado-run';
import {
    classifyVivadoReport,
    discoverVivadoReports,
    parseVivadoReportSummary,
} from '../../utils/vivado-reports';
import { loadVivadoProjectFromXpr } from '../../utils/vivado-xpr';

function readReportFixture(name: string): string {
    const fixturePath = path.resolve(__dirname, '../../../src/test/fixtures/reports', name);
    return fs.readFileSync(fixturePath, 'utf8');
}

function writeReportFixture(destination: string, fixtureName: string): void {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '../../../src/test/fixtures/reports', fixtureName), destination);
}

function makeProject(root: string): VivadoProject {
    return new VivadoProject({
        name: 'board',
        uri: vscode.Uri.file(root),
        xprFile: vscode.Uri.file(path.join(root, 'board.xpr')),
        runs: [
            new VivadoRun({
                name: 'synth_1',
                type: VivadoRunType.Synthesis,
            }),
            new VivadoRun({
                name: 'impl_1',
                type: VivadoRunType.Implementation,
            }),
        ],
    });
}

suite('Vivado report summaries', () => {
    test('classifies common Vivado report names', () => {
        assert.strictEqual(classifyVivadoReport('top_timing_summary_routed.rpt'), VivadoReportKind.Timing);
        assert.strictEqual(classifyVivadoReport('top_utilization_placed.rpt'), VivadoReportKind.Utilization);
        assert.strictEqual(classifyVivadoReport('top_methodology_drc_routed.rpt'), VivadoReportKind.Methodology);
        assert.strictEqual(classifyVivadoReport('top_drc_routed.rpt'), VivadoReportKind.Drc);
        assert.strictEqual(classifyVivadoReport('top_power_routed.rpt'), VivadoReportKind.Power);
        assert.strictEqual(classifyVivadoReport('unknown_report.rpt'), VivadoReportKind.Other);
    });

    test('parses timing summary metrics from fixture output', () => {
        const summary = parseVivadoReportSummary(VivadoReportKind.Timing, readReportFixture('timing_summary.rpt'));

        assert.strictEqual(summary?.description, 'WNS -0.123 ns, TNS -1.234 ns, 5 failing endpoints');
        assert.deepStrictEqual(summary?.details, [
            'Worst negative slack: -0.123 ns',
            'Total negative slack: -1.234 ns',
            'Failing endpoints: 5',
            'Failing clocks: sys_clk',
        ]);
    });

    test('parses utilization summary metrics from fixture output', () => {
        const summary = parseVivadoReportSummary(VivadoReportKind.Utilization, readReportFixture('utilization.rpt'));

        assert.strictEqual(
            summary?.description,
            'LUT 1234/20800 (5.93%), FF 5678/41600 (13.65%), BRAM 10/50 (20.00%), DSP 4/90 (4.44%)',
        );
    });

    test('parses DRC and methodology severity summaries from fixture output', () => {
        const drcSummary = parseVivadoReportSummary(VivadoReportKind.Drc, readReportFixture('drc.rpt'));
        const methodologySummary = parseVivadoReportSummary(VivadoReportKind.Methodology, readReportFixture('methodology.rpt'));

        assert.strictEqual(drcSummary?.description, 'DRC: 1 error, 1 critical warning, 1 warning');
        assert.deepStrictEqual(drcSummary?.details, [
            'Errors: 1',
            'Critical warnings: 1',
            'Warnings: 1',
        ]);
        assert.strictEqual(methodologySummary?.description, 'Methodology: 1 critical warning, 1 warning');
    });

    test('parses report severity count labels without mixing warning classes', () => {
        const summary = parseVivadoReportSummary(
            VivadoReportKind.Drc,
            [
                'Errors: 0',
                'Critical Warnings: 2',
                'Warnings: 3',
            ].join('\n'),
        );

        assert.strictEqual(summary?.description, 'DRC: 2 critical warnings, 3 warnings');
        assert.deepStrictEqual(summary?.details, [
            'Errors: 0',
            'Critical warnings: 2',
            'Warnings: 3',
        ]);
    });

    test('parses power summary metrics from fixture output', () => {
        const summary = parseVivadoReportSummary(VivadoReportKind.Power, readReportFixture('power.rpt'));

        assert.strictEqual(summary?.description, 'Power 2.345 W');
        assert.deepStrictEqual(summary?.details, ['Total on-chip power: 2.345 W']);
    });

    test('returns no summary for unrecognized report content', () => {
        assert.strictEqual(parseVivadoReportSummary(VivadoReportKind.Other, 'plain text'), undefined);
        assert.strictEqual(parseVivadoReportSummary(VivadoReportKind.Timing, 'no timing numbers here'), undefined);
    });
});

suite('Vivado report discovery', () => {
    const tempRoots: string[] = [];

    teardown(() => {
        while (tempRoots.length > 0) {
            const root = tempRoots.pop();
            if (root) {
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    });

    test('discovers configured and run-output reports with summaries', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-vivado-reports-'));
        tempRoots.push(root);
        writeReportFixture(path.join(root, 'reports', 'timing_summary.rpt'), 'timing_summary.rpt');
        writeReportFixture(path.join(root, 'board.runs', 'impl_1', 'top_utilization_placed.rpt'), 'utilization.rpt');
        fs.writeFileSync(path.join(root, 'reports', 'notes.txt'), 'not a report');

        const reports = await discoverVivadoReports(makeProject(root), {
            reportsDirectory: 'reports',
        });

        assert.deepStrictEqual(reports.map(report => report.name), [
            'top_utilization_placed.rpt',
            'timing_summary.rpt',
        ]);
        assert.strictEqual(reports[0].kind, VivadoReportKind.Utilization);
        assert.strictEqual(reports[0].runName, 'impl_1');
        assert.ok(reports[0].summary?.description.includes('LUT 1234/20800'));
        assert.strictEqual(reports[1].kind, VivadoReportKind.Timing);
        assert.strictEqual(reports[1].runName, undefined);
        assert.strictEqual(reports[1].summary?.description, 'WNS -0.123 ns, TNS -1.234 ns, 5 failing endpoints');
    });

    test('degrades to no reports when report directories are missing', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-vivado-no-reports-'));
        tempRoots.push(root);

        const reports = await discoverVivadoReports(makeProject(root), {
            reportsDirectory: 'reports',
        });

        assert.deepStrictEqual(reports, []);
    });

    test('loadVivadoProjectFromXpr attaches discovered report summaries', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-vivado-xpr-reports-'));
        tempRoots.push(root);
        fs.writeFileSync(path.join(root, 'board.xpr'), `<Project>
          <Configuration>
            <Option Name="ProjectName" Val="board" />
          </Configuration>
          <Runs>
            <Run Id="impl_1" Type="Ft2:EntireDesign" />
          </Runs>
        </Project>`);
        writeReportFixture(path.join(root, 'board.runs', 'impl_1', 'top_drc_routed.rpt'), 'drc.rpt');

        const project = await loadVivadoProjectFromXpr(vscode.Uri.file(path.join(root, 'board.xpr')), {
            reportsDirectory: 'reports',
        });

        assert.strictEqual(project.reports.length, 1);
        assert.strictEqual(project.reports[0].kind, VivadoReportKind.Drc);
        assert.strictEqual(project.reports[0].runName, 'impl_1');
        assert.strictEqual(project.reports[0].summary?.description, 'DRC: 1 error, 1 critical warning, 1 warning');
    });
});

/**
 * Tests for the initial Vivado domain model layer.
 * Covers #7 - Introduce Vivado domain models.
 */
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { HLSProject } from '../../models/hls-project';
import { VivadoBlockDesign } from '../../models/vivado-block-design';
import { VivadoFile, VivadoFileKind } from '../../models/vivado-file';
import { VivadoFileset, VivadoFilesetKind } from '../../models/vivado-fileset';
import { VivadoIp } from '../../models/vivado-ip';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoReport, VivadoReportKind } from '../../models/vivado-report';
import { VivadoRun, VivadoRunStatus, VivadoRunType } from '../../models/vivado-run';

function uri(filePath: string): vscode.Uri {
    return vscode.Uri.file(filePath);
}

function makeProject(): VivadoProject {
    const projectRoot = uri(path.join('/workspace', 'board-design'));
    const sourceFile = new VivadoFile({
        uri: uri(path.join('/workspace', 'board-design', 'src', 'top.sv')),
        kind: VivadoFileKind.DesignSource,
        library: 'xil_defaultlib',
        filesetName: 'sources_1',
    });
    const simulationFile = new VivadoFile({
        uri: uri(path.join('/workspace', 'board-design', 'sim', 'top_tb.sv')),
        kind: VivadoFileKind.SimulationSource,
        filesetName: 'sim_1',
    });
    const constraintFile = new VivadoFile({
        uri: uri(path.join('/workspace', 'board-design', 'constraints', 'top.xdc')),
        kind: VivadoFileKind.Constraint,
        filesetName: 'constrs_1',
    });

    return new VivadoProject({
        name: 'board-design',
        uri: projectRoot,
        xprFile: vscode.Uri.joinPath(projectRoot, 'board-design.xpr'),
        part: 'xc7a200tsbg484-1',
        boardPart: 'digilentinc.com:arty-a7-100:part0:1.1',
        topModule: 'top',
        filesets: [
            new VivadoFileset({
                name: 'sources_1',
                kind: VivadoFilesetKind.Sources,
                files: [sourceFile],
            }),
            new VivadoFileset({
                name: 'sim_1',
                kind: VivadoFilesetKind.Simulation,
                files: [simulationFile],
            }),
            new VivadoFileset({
                name: 'constrs_1',
                kind: VivadoFilesetKind.Constraints,
                files: [constraintFile],
            }),
        ],
        ips: [
            new VivadoIp({
                name: 'clk_wiz_0',
                uri: uri(path.join('/workspace', 'board-design', 'ip', 'clk_wiz_0.xci')),
                vendor: 'xilinx.com',
                library: 'ip',
                version: '6.0',
                status: 'locked',
            }),
        ],
        blockDesigns: [
            new VivadoBlockDesign({
                name: 'system',
                uri: uri(path.join('/workspace', 'board-design', 'bd', 'system.bd')),
                isOutOfDate: true,
            }),
        ],
        runs: [
            new VivadoRun({
                name: 'synth_1',
                type: VivadoRunType.Synthesis,
                status: VivadoRunStatus.Complete,
                strategy: 'Vivado Synthesis Defaults',
            }),
            new VivadoRun({
                name: 'impl_1',
                type: VivadoRunType.Implementation,
                status: VivadoRunStatus.Running,
                parentRunName: 'synth_1',
            }),
        ],
        reports: [
            new VivadoReport({
                name: 'timing-summary',
                uri: uri(path.join('/workspace', 'board-design', 'reports', 'timing_summary.rpt')),
                kind: VivadoReportKind.Timing,
                runName: 'impl_1',
            }),
        ],
    });
}

suite('VivadoProject', () => {
    test('fromXprUri derives project name and root URI from the .xpr path', () => {
        const xprFile = uri(path.join('/workspace', 'blink', 'blink.xpr'));
        const project = VivadoProject.fromXprUri(xprFile);

        assert.strictEqual(project.name, 'blink');
        assert.strictEqual(project.uri.fsPath, vscode.Uri.joinPath(xprFile, '..').fsPath);
        assert.strictEqual(project.xprFile.fsPath, xprFile.fsPath);
    });

    test('stores Vivado project metadata without requiring Vivado to launch', () => {
        const project = makeProject();

        assert.strictEqual(project.part, 'xc7a200tsbg484-1');
        assert.strictEqual(project.boardPart, 'digilentinc.com:arty-a7-100:part0:1.1');
        assert.strictEqual(project.topModule, 'top');
    });

    test('keeps Vivado and HLS project concepts separate', () => {
        const vivadoProject = makeProject();
        const hlsProject = new HLSProject(uri(path.join('/workspace', 'hls', 'hls.app')), 'hls', 'top');

        assert.ok(!(vivadoProject instanceof HLSProject));
        assert.ok(!(hlsProject instanceof VivadoProject));
        assert.strictEqual((vivadoProject as any).solutions, undefined);
        assert.strictEqual((hlsProject as any).filesets, undefined);
    });

    test('flattens design, simulation, and constraint files for shared UI consumers', () => {
        const project = makeProject();

        assert.deepStrictEqual(project.designSources.map(file => path.basename(file.uri.fsPath)), ['top.sv']);
        assert.deepStrictEqual(project.simulationSources.map(file => path.basename(file.uri.fsPath)), ['top_tb.sv']);
        assert.deepStrictEqual(project.constraints.map(file => path.basename(file.uri.fsPath)), ['top.xdc']);
        assert.strictEqual(project.files.length, 3);
    });

    test('captures IP, block design, run, and report metadata', () => {
        const project = makeProject();

        assert.strictEqual(project.ips[0].name, 'clk_wiz_0');
        assert.strictEqual(project.ips[0].status, 'locked');
        assert.strictEqual(project.blockDesigns[0].name, 'system');
        assert.strictEqual(project.blockDesigns[0].isOutOfDate, true);
        assert.strictEqual(project.reports[0].kind, VivadoReportKind.Timing);
        assert.strictEqual(project.reports[0].runName, 'impl_1');
    });

    test('filters runs by Vivado run type', () => {
        const project = makeProject();

        assert.deepStrictEqual(project.runsByType(VivadoRunType.Synthesis).map(run => run.name), ['synth_1']);
        assert.deepStrictEqual(project.runsByType(VivadoRunType.Implementation).map(run => run.name), ['impl_1']);
        assert.deepStrictEqual(project.runsByType(VivadoRunType.Simulation), []);
    });
});

suite('VivadoFileset', () => {
    test('defaults to an empty file list', () => {
        const fileset = new VivadoFileset({
            name: 'sources_1',
            kind: VivadoFilesetKind.Sources,
        });

        assert.deepStrictEqual(fileset.files, []);
        assert.deepStrictEqual(fileset.designSources, []);
    });
});

suite('VivadoRun', () => {
    test('defaults run status to unknown', () => {
        const run = new VivadoRun({
            name: 'synth_1',
            type: VivadoRunType.Synthesis,
        });

        assert.strictEqual(run.status, VivadoRunStatus.Unknown);
    });
});

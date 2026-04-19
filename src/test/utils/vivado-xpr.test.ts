/**
 * Tests for safe Vivado .xpr metadata loading.
 * Covers #8 - Add Vivado project discovery and metadata loading.
 */
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { VivadoFileKind } from '../../models/vivado-file';
import { VivadoFilesetKind } from '../../models/vivado-fileset';
import { VivadoRunStatus, VivadoRunType } from '../../models/vivado-run';
import { parseVivadoProjectXml } from '../../utils/vivado-xpr';

const SAMPLE_XPR = `<?xml version="1.0" encoding="UTF-8"?>
<Project Version="7" Minor="60" Path="mock_vivado_project.xpr">
  <Configuration>
    <Option Name="ProjectName" Val="mock_vivado_project" />
    <Option Name="Part" Val="xc7a35tcpg236-1" />
    <Option Name="BoardPart" Val="digilentinc.com:arty-a7-35:part0:1.0" />
    <Option Name="TopModule" Val="counter" />
  </Configuration>
  <FileSets>
    <FileSet Name="sources_1" Type="DesignSrcs">
      <File Path="$PPRDIR/../src/rtl/counter.sv" Library="xil_defaultlib" />
      <File Path="$PPRDIR/../ip/clk_wiz_0.xci" />
      <File Path="$PPRDIR/../bd/system.bd" />
    </FileSet>
    <FileSet Name="sim_1" Type="SimulationSrcs">
      <File Path="$PPRDIR/../src/sim/counter_tb.sv" />
    </FileSet>
    <FileSet Name="constrs_1" Type="Constrs">
      <File Path="$PPRDIR/../constraints/counter.xdc" />
    </FileSet>
  </FileSets>
  <Runs>
    <Run Id="synth_1" Type="Ft3:Synth" Part="xc7a35tcpg236-1" Status="complete" Strategy="Vivado Synthesis Defaults" />
    <Run Id="impl_1" Type="Ft2:EntireDesign" Part="xc7a35tcpg236-1" Status="running" Parent="synth_1" />
  </Runs>
</Project>`;

function xprUri(projectName: string = 'mock_vivado_project'): vscode.Uri {
    return vscode.Uri.file(path.join('/workspace', projectName, `${projectName}.xpr`));
}

suite('Vivado XPR metadata loading', () => {
    test('loads project identity and board metadata from a .xpr file', async () => {
        const project = await parseVivadoProjectXml(SAMPLE_XPR, xprUri());

        assert.strictEqual(project.name, 'mock_vivado_project');
        assert.strictEqual(project.part, 'xc7a35tcpg236-1');
        assert.strictEqual(project.boardPart, 'digilentinc.com:arty-a7-35:part0:1.0');
        assert.strictEqual(project.topModule, 'counter');
    });

    test('falls back to the .xpr file name when ProjectName is absent', async () => {
        const project = await parseVivadoProjectXml(
            '<Project><Configuration /></Project>',
            xprUri('fallback_name'),
        );

        assert.strictEqual(project.name, 'fallback_name');
    });

    test('loads filesets, files, and source categories', async () => {
        const project = await parseVivadoProjectXml(SAMPLE_XPR, xprUri());

        assert.deepStrictEqual(project.filesets.map(fileset => fileset.kind), [
            VivadoFilesetKind.Sources,
            VivadoFilesetKind.Simulation,
            VivadoFilesetKind.Constraints,
        ]);
        assert.deepStrictEqual(project.designSources.map(file => path.basename(file.uri.fsPath)), [
            'counter.sv',
            'clk_wiz_0.xci',
            'system.bd',
        ]);
        assert.deepStrictEqual(project.simulationSources.map(file => path.basename(file.uri.fsPath)), ['counter_tb.sv']);
        assert.deepStrictEqual(project.constraints.map(file => path.basename(file.uri.fsPath)), ['counter.xdc']);
        assert.strictEqual(project.designSources[0].kind, VivadoFileKind.DesignSource);
        assert.strictEqual(project.designSources[0].library, 'xil_defaultlib');
    });

    test('skips file entries without usable paths', async () => {
        const project = await parseVivadoProjectXml(
            `<Project>
              <FileSets>
                <FileSet Name="sources_1" Type="DesignSrcs">
                  <File />
                  <File Path="   " />
                  <File Path="$PPRDIR/src/top.sv" />
                </FileSet>
              </FileSets>
            </Project>`,
            xprUri(),
        );

        assert.strictEqual(project.filesets[0].files.length, 1);
        assert.deepStrictEqual(project.designSources.map(file => path.basename(file.uri.fsPath)), ['top.sv']);
        assert.deepStrictEqual(project.ips, []);
        assert.deepStrictEqual(project.blockDesigns, []);
    });

    test('resolves $PPRDIR paths relative to the project file directory', async () => {
        const project = await parseVivadoProjectXml(SAMPLE_XPR, xprUri());
        const source = project.designSources.find(file => path.basename(file.uri.fsPath) === 'counter.sv');

        assert.strictEqual(
            source?.uri.fsPath,
            path.normalize(path.join('/workspace', 'src', 'rtl', 'counter.sv')),
        );
    });

    test('loads IP and block design entries from .xci and .bd files', async () => {
        const project = await parseVivadoProjectXml(SAMPLE_XPR, xprUri());

        assert.deepStrictEqual(project.ips.map(ip => ip.name), ['clk_wiz_0']);
        assert.deepStrictEqual(project.blockDesigns.map(blockDesign => blockDesign.name), ['system']);
    });

    test('loads synthesis and implementation runs', async () => {
        const project = await parseVivadoProjectXml(SAMPLE_XPR, xprUri());

        assert.strictEqual(project.runs[0].name, 'synth_1');
        assert.strictEqual(project.runs[0].type, VivadoRunType.Synthesis);
        assert.strictEqual(project.runs[0].status, VivadoRunStatus.Complete);
        assert.strictEqual(project.runs[0].strategy, 'Vivado Synthesis Defaults');
        assert.strictEqual(project.runs[1].type, VivadoRunType.Implementation);
        assert.strictEqual(project.runs[1].status, VivadoRunStatus.Running);
        assert.strictEqual(project.runs[1].parentRunName, 'synth_1');
    });

    test('throws a useful error when the file is not a Vivado project XML document', async () => {
        await assert.rejects(
            () => parseVivadoProjectXml('<NotProject />', xprUri()),
            /missing Project root element/,
        );
    });
});

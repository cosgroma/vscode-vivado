#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const workspaceTypes = new Set(['hls', 'vivado', 'mixed']);

const defaultRoots = {
  hls: 'scratch/mock-hls-workspace',
  vivado: 'scratch/mock-vivado-workspace',
  mixed: 'scratch/mock-fpga-workspace',
};

const defaultNames = {
  hls: 'mock_hls_project',
  vivado: 'mock_vivado_project',
  mixed: 'mock_fpga_project',
};

const defaultOptions = {
  type: 'hls',
  root: undefined,
  name: undefined,
  force: false,
  top: 'top',
  solutions: ['solution1', 'solution2'],
  part: 'xc7a35tcpg236-1',
  board: 'digilentinc.com:arty-a7-35:part0:1.0',
};

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  validateOptions(options);

  const targetRoot = path.resolve(options.root ?? defaultRoots[options.type]);
  const names = getProjectNames(options);

  await prepareTargetRoot(targetRoot, options.force);
  await mkdir(targetRoot, { recursive: true });

  const created = [];

  if (options.type === 'hls' || options.type === 'mixed') {
    await createHlsWorkspace(targetRoot, names.hls, options);
    created.push(`HLS project: ${names.hls}/hls.app`);
  }

  if (options.type === 'vivado' || options.type === 'mixed') {
    await createVivadoWorkspace(targetRoot, names.vivado, options);
    created.push(`Vivado project: ${names.vivado}/${names.vivado}.xpr`);
  }

  await createWorkspaceReadme(targetRoot, options, names);

  console.log(`Created ${options.type} mock workspace at:`);
  console.log(targetRoot);
  console.log('');
  console.log('Generated:');
  for (const item of created) {
    console.log(`- ${item}`);
  }
  console.log('');

  if (options.type === 'vivado') {
    console.log('Open this folder in an Extension Development Host to activate the extension via the .xpr file.');
  } else {
    console.log('Open this folder in an Extension Development Host to see the HLS project tree.');
  }
}

function parseArgs(args) {
  const options = { ...defaultOptions };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--type':
      case '--kind':
        options.type = readValue(args, ++index, arg);
        break;
      case '--root':
      case '--out':
        options.root = readValue(args, ++index, arg);
        break;
      case '--name':
        options.name = readValue(args, ++index, arg);
        break;
      case '--force':
        options.force = true;
        break;
      case '--top':
        options.top = readValue(args, ++index, arg);
        break;
      case '--solutions':
        options.solutions = readValue(args, ++index, arg)
          .split(',')
          .map(value => value.trim())
          .filter(Boolean);
        break;
      case '--part':
      case '--vivado-part':
        options.part = readValue(args, ++index, arg);
        break;
      case '--board':
      case '--vivado-board':
        options.board = readValue(args, ++index, arg);
        break;
      default:
        throw new Error(`Unknown option: ${arg}. Run with --help for usage.`);
    }
  }

  return options;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function validateOptions(options) {
  if (!workspaceTypes.has(options.type)) {
    throw new Error(`Invalid --type "${options.type}". Expected one of: ${[...workspaceTypes].join(', ')}`);
  }

  assertIdentifier(options.top, '--top');

  if (options.solutions.length === 0) {
    throw new Error('--solutions must include at least one solution name.');
  }

  for (const solution of options.solutions) {
    assertSafePathSegment(solution, '--solutions');
  }

  const names = getProjectNames(options);
  assertSafePathSegment(names.hls, '--name');
  assertSafePathSegment(names.vivado, '--name');
}

function getProjectNames(options) {
  const baseName = options.name ?? defaultNames[options.type];

  if (options.type === 'mixed' && options.name) {
    return {
      hls: `${baseName}_hls`,
      vivado: `${baseName}_vivado`,
    };
  }

  if (options.type === 'mixed') {
    return {
      hls: defaultNames.hls,
      vivado: defaultNames.vivado,
    };
  }

  return {
    hls: baseName,
    vivado: baseName,
  };
}

function assertIdentifier(value, flag) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`${flag} must be a valid C/C++ identifier.`);
  }
}

function assertSafePathSegment(value, flag) {
  if (!value || value.includes('/') || value.includes('\\') || value === '.' || value === '..') {
    throw new Error(`${flag} values must be simple names, not paths.`);
  }

  if (/[<>:"|?*]/.test(value)) {
    throw new Error(`${flag} contains a character that is not safe in project names.`);
  }
}

async function prepareTargetRoot(targetRoot, force) {
  if (!existsSync(targetRoot)) {
    return;
  }

  const existing = await stat(targetRoot);
  if (!existing.isDirectory()) {
    throw new Error(`Target exists and is not a directory: ${targetRoot}`);
  }

  if (!force) {
    throw new Error(`Target already exists: ${targetRoot}\nRe-run with --force to replace it.`);
  }

  assertSafeRemovalTarget(targetRoot);
  await rm(targetRoot, { recursive: true, force: true });
}

function assertSafeRemovalTarget(targetRoot) {
  const cwd = path.resolve(process.cwd());
  const parsed = path.parse(targetRoot);

  if (targetRoot === parsed.root) {
    throw new Error(`Refusing to remove filesystem root: ${targetRoot}`);
  }

  if (targetRoot === cwd || cwd.startsWith(`${targetRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove the current workspace or one of its parent folders: ${targetRoot}`);
  }
}

async function createHlsWorkspace(targetRoot, projectName, options) {
  const hlsProjectDir = path.join(projectName);
  const includeName = `${options.top}.hpp`;
  const sourceName = `${options.top}.cpp`;
  const testBenchName = `${options.top}_tb.cpp`;

  await writeText(targetRoot, path.join(hlsProjectDir, 'hls.app'), hlsAppXml(projectName, options, sourceName, includeName, testBenchName));
  await writeText(targetRoot, path.join('src', sourceName), hlsSource(options.top, includeName));
  await writeText(targetRoot, path.join('include', includeName), hlsHeader(options.top));
  await writeText(targetRoot, path.join('tb', testBenchName), hlsTestBench(options.top, includeName));
  await writeJson(targetRoot, path.join('.vscode', 'c_cpp_properties.json'), cppProperties());
}

async function createVivadoWorkspace(targetRoot, projectName, options) {
  await writeText(targetRoot, path.join(projectName, `${projectName}.xpr`), vivadoProjectXml(projectName, options));
  await writeText(targetRoot, path.join('src', 'rtl', 'counter.sv'), vivadoCounterSource());
  await writeText(targetRoot, path.join('src', 'sim', 'counter_tb.sv'), vivadoCounterTestBench());
  await writeText(targetRoot, path.join('constraints', 'counter.xdc'), vivadoConstraints());
  await writeText(targetRoot, path.join('scripts', 'run_synth.tcl'), vivadoSynthesisScript(projectName));
  await writeText(targetRoot, path.join('reports', 'timing_summary.rpt'), vivadoTimingReport());
}

async function createWorkspaceReadme(targetRoot, options, names) {
  const sections = [];

  if (options.type === 'hls' || options.type === 'mixed') {
    sections.push(`## HLS Mock

- Project file: \`${names.hls}/hls.app\`
- Top function: \`${options.top}\`
- Solutions: ${options.solutions.map(value => `\`${value}\``).join(', ')}

The current extension discovers this project and renders it in the Vitis HLS IDE Projects view. Run actions still require a real Vitis/Vitis HLS installation.`);
  }

  if (options.type === 'vivado' || options.type === 'mixed') {
    sections.push(`## Vivado Mock

- Project file: \`${names.vivado}/${names.vivado}.xpr\`
- Part: \`${options.part}\`
- Board: \`${options.board}\`

The extension activates this workspace via the \`workspaceContains:**/*.xpr\` activation event. Vivado project discovery and tree-view support are under active development.`);
  }

  await writeText(targetRoot, 'README.md', `# Mock FPGA Workspace

Generated by \`npm run mock:workspace\`.

${sections.join('\n\n')}
`);
}

function hlsAppXml(projectName, options, sourceName, includeName, testBenchName) {
  const solutions = options.solutions
    .map((solution, index) => `    <solution name="${escapeXml(solution)}" status="${index === 0 ? 'active' : 'inactive'}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<project name="${escapeXml(projectName)}" top="${escapeXml(options.top)}">
  <solutions>
${solutions}
  </solutions>
  <files>
    <file name="src/${escapeXml(sourceName)}" sc="0" tb="0" cflags="" csimflags="" blackbox="0" />
    <file name="include/${escapeXml(includeName)}" sc="0" tb="0" cflags="" csimflags="" blackbox="0" />
    <file name="../../tb/${escapeXml(testBenchName)}" sc="0" tb="1" cflags="" csimflags="" blackbox="0" />
  </files>
</project>
`;
}

function hlsHeader(top) {
  return `#pragma once

int ${top}(int value);
`;
}

function hlsSource(top, includeName) {
  return `#include "../include/${includeName}"

int ${top}(int value) {
    return value + 1;
}
`;
}

function hlsTestBench(top, includeName) {
  return `#include "../include/${includeName}"

int main() {
    return ${top}(41) == 42 ? 0 : 1;
}
`;
}

function cppProperties() {
  return {
    configurations: [
      {
        name: 'Mock HLS',
        includePath: [
          '${workspaceFolder}/include',
          'C:\\Xilinx\\Vitis_HLS\\2023.2\\include\\**',
        ],
        defines: [],
        compilerPath: '',
        cStandard: 'c17',
        cppStandard: 'c++17',
        intelliSenseMode: 'windows-msvc-x64',
      },
    ],
    version: 4,
  };
}

function vivadoProjectXml(projectName, options) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Project Version="7" Minor="60" Path="${escapeXml(projectName)}.xpr">
  <Configuration>
    <Option Name="ProjectName" Val="${escapeXml(projectName)}" />
    <Option Name="Part" Val="${escapeXml(options.part)}" />
    <Option Name="BoardPart" Val="${escapeXml(options.board)}" />
    <Option Name="TopModule" Val="counter" />
    <Option Name="SimulatorLanguage" Val="Mixed" />
  </Configuration>
  <FileSets>
    <FileSet Name="sources_1" Type="DesignSrcs" RelSrcDir="$PPRDIR/../src/rtl">
      <Filter Type="Srcs" />
      <File Path="$PPRDIR/../src/rtl/counter.sv">
        <FileInfo>
          <Attr Name="UsedIn" Val="synthesis" />
          <Attr Name="UsedIn" Val="implementation" />
        </FileInfo>
      </File>
    </FileSet>
    <FileSet Name="sim_1" Type="SimulationSrcs" RelSrcDir="$PPRDIR/../src/sim">
      <Filter Type="Srcs" />
      <File Path="$PPRDIR/../src/sim/counter_tb.sv">
        <FileInfo>
          <Attr Name="UsedIn" Val="simulation" />
        </FileInfo>
      </File>
    </FileSet>
    <FileSet Name="constrs_1" Type="Constrs" RelSrcDir="$PPRDIR/../constraints">
      <Filter Type="Constrs" />
      <File Path="$PPRDIR/../constraints/counter.xdc">
        <FileInfo>
          <Attr Name="UsedIn" Val="synthesis" />
          <Attr Name="UsedIn" Val="implementation" />
        </FileInfo>
      </File>
    </FileSet>
  </FileSets>
  <Runs>
    <Run Id="synth_1" Type="Ft3:Synth" Part="${escapeXml(options.part)}" />
    <Run Id="impl_1" Type="Ft2:EntireDesign" Part="${escapeXml(options.part)}" />
  </Runs>
</Project>
`;
}

function vivadoCounterSource() {
  return `module counter #(
    parameter int WIDTH = 8
) (
    input logic clk,
    input logic rst,
    input logic enable,
    output logic [WIDTH-1:0] value
);
    always_ff @(posedge clk) begin
        if (rst) begin
            value <= '0;
        end else if (enable) begin
            value <= value + 1'b1;
        end
    end
endmodule
`;
}

function vivadoCounterTestBench() {
  return `module counter_tb;
    logic clk = 1'b0;
    logic rst = 1'b1;
    logic enable = 1'b0;
    logic [7:0] value;

    counter dut (
        .clk(clk),
        .rst(rst),
        .enable(enable),
        .value(value)
    );

    always #5 clk = ~clk;

    initial begin
        repeat (2) @(posedge clk);
        rst = 1'b0;
        enable = 1'b1;
        repeat (8) @(posedge clk);
        $finish;
    end
endmodule
`;
}

function vivadoConstraints() {
  return `create_clock -period 10.000 -name clk [get_ports clk]
set_property PACKAGE_PIN E3 [get_ports clk]
set_property IOSTANDARD LVCMOS33 [get_ports clk]
`;
}

function vivadoSynthesisScript(projectName) {
  return `open_project ../${projectName}/${projectName}.xpr
launch_runs synth_1
wait_on_run synth_1
report_timing_summary -file ../reports/timing_summary.rpt
`;
}

function vivadoTimingReport() {
  return `Mock timing summary

Design timing summary:
  WNS: 1.234 ns
  TNS: 0.000 ns
  WHS: 0.321 ns
  THS: 0.000 ns
`;
}

async function writeJson(root, relativePath, value) {
  await writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function printHelp() {
  console.log(`Create mock FPGA workspaces for extension development.

Usage:
  npm run mock:workspace -- [options]

Options:
  --type <hls|vivado|mixed>   Workspace type to create. Default: hls
  --root <path>               Output folder. Defaults to scratch/mock-*-workspace
  --name <name>               Project name. Mixed workspaces append _hls and _vivado
  --force                     Replace the output folder if it already exists
  --top <identifier>          HLS top function name. Default: top
  --solutions <a,b>           HLS solution names. Default: solution1,solution2
  --part <part>               Vivado part. Default: xc7a35tcpg236-1
  --board <board>             Vivado board part. Default: digilentinc.com:arty-a7-35:part0:1.0
  --help                      Show this help

Examples:
  npm run mock:workspace
  npm run mock:workspace -- --type hls --root scratch/demo-hls --force
  npm run mock:workspace -- --type vivado --root scratch/demo-vivado --force
  npm run mock:workspace -- --type mixed --name demo --force
`);
}

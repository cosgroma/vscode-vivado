import path from 'path';
import * as vscode from 'vscode';
import { VivadoProject } from '../models/vivado-project';
import { VivadoReport, VivadoReportKind, VivadoReportSummary } from '../models/vivado-report';

interface ReportFileSystem {
    readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]>;
    readFile(uri: vscode.Uri): Thenable<Uint8Array>;
}

export interface DiscoverVivadoReportsOptions {
    reportsDirectory: string;
    fs: ReportFileSystem;
    maxDepth: number;
    maxFiles: number;
}

interface UtilizationRow {
    name: string;
    label: string;
    used: string;
    available?: string;
    percent?: string;
}

interface SeverityCounts {
    errors: number;
    criticalWarnings: number;
    warnings: number;
}

const defaultReportsDirectory = 'reports';
const defaultMaxDepth = 6;
const defaultMaxFiles = 250;

export async function discoverVivadoReports(
    project: VivadoProject,
    options: Partial<DiscoverVivadoReportsOptions> = {},
): Promise<VivadoReport[]> {
    const fs = options.fs ?? vscode.workspace.fs;
    const reportsDirectory = options.reportsDirectory ?? defaultReportsDirectory;
    const maxDepth = options.maxDepth ?? defaultMaxDepth;
    const maxFiles = options.maxFiles ?? defaultMaxFiles;
    const reportUris = await collectReportUris(candidateReportDirectories(project, reportsDirectory), fs, maxDepth, maxFiles);
    const runNames = project.runs.map(run => run.name);

    const reports = await Promise.all(reportUris.map(async uri => {
        const name = path.basename(uri.fsPath);
        const kind = classifyVivadoReport(name);
        const summary = await readVivadoReportSummary(uri, kind, fs);

        return new VivadoReport({
            name,
            uri,
            kind,
            runName: inferRunName(uri, runNames),
            summary,
        });
    }));

    return reports.sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath));
}

export function classifyVivadoReport(fileName: string): VivadoReportKind {
    const normalizedName = fileName.toLowerCase();

    if (normalizedName.includes('timing')) {
        return VivadoReportKind.Timing;
    }

    if (normalizedName.includes('util')) {
        return VivadoReportKind.Utilization;
    }

    if (normalizedName.includes('methodology')) {
        return VivadoReportKind.Methodology;
    }

    if (normalizedName.includes('drc')) {
        return VivadoReportKind.Drc;
    }

    if (normalizedName.includes('power')) {
        return VivadoReportKind.Power;
    }

    return VivadoReportKind.Other;
}

export function parseVivadoReportSummary(kind: VivadoReportKind, content: string): VivadoReportSummary | undefined {
    switch (kind) {
        case VivadoReportKind.Timing:
            return parseTimingSummary(content);
        case VivadoReportKind.Utilization:
            return parseUtilizationSummary(content);
        case VivadoReportKind.Drc:
            return parseSeveritySummary('DRC', parseSeverityCounts(content, 'DRC'));
        case VivadoReportKind.Methodology:
            return parseSeveritySummary('Methodology', parseSeverityCounts(content, 'Methodology'));
        case VivadoReportKind.Power:
            return parsePowerSummary(content);
        default:
            return undefined;
    }
}

async function readVivadoReportSummary(
    uri: vscode.Uri,
    kind: VivadoReportKind,
    fs: ReportFileSystem,
): Promise<VivadoReportSummary | undefined> {
    try {
        const data = await fs.readFile(uri);
        return parseVivadoReportSummary(kind, Buffer.from(data).toString('utf8'));
    } catch {
        return undefined;
    }
}

function candidateReportDirectories(project: VivadoProject, reportsDirectory: string): vscode.Uri[] {
    const directories = [
        resolveConfiguredReportsDirectory(project, reportsDirectory),
        vscode.Uri.joinPath(project.uri, `${project.name}.runs`),
    ];
    const seen = new Set<string>();

    return directories.filter(uri => {
        const key = uri.toString();
        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function resolveConfiguredReportsDirectory(project: VivadoProject, reportsDirectory: string): vscode.Uri {
    const normalizedDirectory = reportsDirectory.trim() || defaultReportsDirectory;

    if (path.isAbsolute(normalizedDirectory)) {
        return vscode.Uri.file(path.normalize(normalizedDirectory));
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(project.uri);
    return joinUriPath(workspaceFolder?.uri ?? project.uri, normalizedDirectory);
}

function joinUriPath(base: vscode.Uri, relativePath: string): vscode.Uri {
    const segments = relativePath.split(/[\\/]+/).filter(segment => segment.length > 0);
    return segments.length === 0 ? base : vscode.Uri.joinPath(base, ...segments);
}

async function collectReportUris(
    directories: vscode.Uri[],
    fs: ReportFileSystem,
    maxDepth: number,
    maxFiles: number,
): Promise<vscode.Uri[]> {
    const reports: vscode.Uri[] = [];
    const seen = new Set<string>();

    for (const directory of directories) {
        await collectReportUrisFromDirectory(directory, fs, maxDepth, maxFiles, reports, seen);
    }

    return reports;
}

async function collectReportUrisFromDirectory(
    directory: vscode.Uri,
    fs: ReportFileSystem,
    depthRemaining: number,
    maxFiles: number,
    reports: vscode.Uri[],
    seen: Set<string>,
): Promise<void> {
    if (depthRemaining < 0 || reports.length >= maxFiles) {
        return;
    }

    let entries: [string, vscode.FileType][];
    try {
        entries = await fs.readDirectory(directory);
    } catch {
        return;
    }

    entries.sort(([left], [right]) => left.localeCompare(right));
    for (const [name, type] of entries) {
        if (reports.length >= maxFiles) {
            return;
        }

        const uri = vscode.Uri.joinPath(directory, name);
        if ((type & vscode.FileType.Directory) !== 0) {
            await collectReportUrisFromDirectory(uri, fs, depthRemaining - 1, maxFiles, reports, seen);
            continue;
        }

        if (!isReportFileName(name)) {
            continue;
        }

        const key = uri.toString();
        if (!seen.has(key)) {
            seen.add(key);
            reports.push(uri);
        }
    }
}

function isReportFileName(fileName: string): boolean {
    return path.extname(fileName).toLowerCase() === '.rpt';
}

function inferRunName(uri: vscode.Uri, runNames: string[]): string | undefined {
    const normalizedPath = uri.fsPath.replace(/\\/g, '/').toLowerCase();
    const segments = normalizedPath.split('/');

    return runNames.find(runName => {
        const normalizedRunName = runName.toLowerCase();
        return segments.includes(normalizedRunName) || path.basename(normalizedPath).includes(normalizedRunName);
    });
}

function parseTimingSummary(content: string): VivadoReportSummary | undefined {
    const tableValues = readValuesFromTable(content, ['WNS(ns)', 'TNS(ns)', 'TNS Failing Endpoints']);
    const wns = findMetric(content, ['WNS(ns)', 'WNS']) ?? tableValues.get(normalizeHeader('WNS(ns)'));
    const tns = findMetric(content, ['TNS(ns)', 'TNS']) ?? tableValues.get(normalizeHeader('TNS(ns)'));
    const failingEndpoints = findMetric(content, ['TNS Failing Endpoints', 'Failing Endpoints'])
        ?? tableValues.get(normalizeHeader('TNS Failing Endpoints'));
    const failingClock = findTextMetric(content, ['Failing Clock', 'Failing Clocks']);
    const parts = [
        wns ? `WNS ${formatNanoseconds(wns)}` : undefined,
        tns ? `TNS ${formatNanoseconds(tns)}` : undefined,
        failingEndpoints ? `${failingEndpoints} failing endpoints` : undefined,
    ].filter((part): part is string => part !== undefined);

    if (parts.length === 0 && !failingClock) {
        return undefined;
    }

    return {
        description: parts.join(', ') || `Failing clocks: ${failingClock}`,
        details: [
            wns ? `Worst negative slack: ${formatNanoseconds(wns)}` : undefined,
            tns ? `Total negative slack: ${formatNanoseconds(tns)}` : undefined,
            failingEndpoints ? `Failing endpoints: ${failingEndpoints}` : undefined,
            failingClock ? `Failing clocks: ${failingClock}` : undefined,
        ].filter((line): line is string => line !== undefined),
    };
}

function parseUtilizationSummary(content: string): VivadoReportSummary | undefined {
    const rows = [
        findUtilizationRow(content, 'LUT', ['Slice LUTs', 'CLB LUTs']),
        findUtilizationRow(content, 'FF', ['Slice Registers', 'CLB Registers', 'Register as Flip Flop']),
        findUtilizationRow(content, 'BRAM', ['Block RAM Tile', 'RAMB36/FIFO', 'Block RAM']),
        findUtilizationRow(content, 'DSP', ['DSPs', 'DSP48E1', 'DSP48E2']),
    ].filter((row): row is UtilizationRow => row !== undefined);

    if (rows.length === 0) {
        return undefined;
    }

    return {
        description: rows.map(formatUtilizationRow).join(', '),
        details: rows.map(row => `${row.name}: ${formatUtilizationRow(row)}`),
    };
}

function parseSeveritySummary(reportName: string, counts: SeverityCounts | undefined): VivadoReportSummary | undefined {
    if (!counts) {
        return undefined;
    }

    const parts = [
        counts.errors > 0 ? pluralize(counts.errors, 'error') : undefined,
        counts.criticalWarnings > 0 ? pluralize(counts.criticalWarnings, 'critical warning') : undefined,
        counts.warnings > 0 ? pluralize(counts.warnings, 'warning') : undefined,
    ].filter((part): part is string => part !== undefined);

    const description = parts.length > 0 ? `${reportName}: ${parts.join(', ')}` : `${reportName}: no violations`;

    return {
        description,
        details: [
            `Errors: ${counts.errors}`,
            `Critical warnings: ${counts.criticalWarnings}`,
            `Warnings: ${counts.warnings}`,
        ],
    };
}

function parsePowerSummary(content: string): VivadoReportSummary | undefined {
    const totalPower = findMetric(content, ['Total On-Chip Power (W)', 'Total On-Chip Power']);

    if (!totalPower) {
        return undefined;
    }

    return {
        description: `Power ${totalPower} W`,
        details: [`Total on-chip power: ${totalPower} W`],
    };
}

function findMetric(content: string, labels: readonly string[]): string | undefined {
    for (const label of labels) {
        const match = content.match(new RegExp(`${metricPrefixPattern()}${labelPattern(label)}\\s*(?:[:=|])?\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
        if (match) {
            return match[1];
        }
    }

    return undefined;
}

function findTextMetric(content: string, labels: readonly string[]): string | undefined {
    for (const label of labels) {
        const match = content.match(new RegExp(`${metricPrefixPattern()}${labelPattern(label)}\\s*(?:[:=|])\\s*([^\\r\\n|]+)`, 'i'));
        if (match) {
            return match[1].trim();
        }
    }

    return undefined;
}

function readValuesFromTable(content: string, requestedHeaders: readonly string[]): Map<string, string> {
    const requested = new Set(requestedHeaders.map(normalizeHeader));
    const rows = parsePipeRows(content);

    for (let index = 0; index < rows.length; index++) {
        const headers = rows[index].map(normalizeHeader);
        if (!headers.some(header => requested.has(header))) {
            continue;
        }

        const values = rows[index + 1];
        if (!values) {
            return new Map();
        }

        const result = new Map<string, string>();
        headers.forEach((header, headerIndex) => {
            if (requested.has(header) && values[headerIndex]) {
                result.set(header, values[headerIndex]);
            }
        });
        return result;
    }

    return new Map();
}

function findUtilizationRow(content: string, name: string, labels: readonly string[]): UtilizationRow | undefined {
    const normalizedLabels = labels.map(label => label.toLowerCase());

    for (const row of parsePipeRows(content)) {
        const firstCell = row[0]?.toLowerCase();
        if (!firstCell || !normalizedLabels.some(label => firstCell.includes(label))) {
            continue;
        }

        return {
            name,
            label: row[0],
            used: row[1],
            available: row[3],
            percent: row[4],
        };
    }

    return undefined;
}

function parsePipeRows(content: string): string[][] {
    return content
        .split(/\r?\n/)
        .filter(line => line.includes('|') && !/^[\s+|\-]+$/.test(line))
        .map(line => line
            .split('|')
            .map(cell => cell.trim())
            .filter(cell => cell.length > 0))
        .filter(row => row.length > 0);
}

function parseSeverityCounts(content: string, reportName: string): SeverityCounts | undefined {
    const escapedReportName = escapeRegExp(reportName);
    const messagePattern = new RegExp(`^(CRITICAL WARNING|ERROR|WARNING):\\s+\\[${escapedReportName}[^\\]]*\\]`, 'im');
    const counts = content.split(/\r?\n/).reduce<SeverityCounts>((summary, line) => {
        const match = line.match(messagePattern);
        if (!match) {
            return summary;
        }

        switch (match[1].toUpperCase()) {
            case 'ERROR':
                summary.errors += 1;
                break;
            case 'CRITICAL WARNING':
                summary.criticalWarnings += 1;
                break;
            default:
                summary.warnings += 1;
                break;
        }

        return summary;
    }, { errors: 0, criticalWarnings: 0, warnings: 0 });

    const labelCounts = {
        errors: findCountMetric(content, ['Errors', 'Error']),
        criticalWarnings: findCountMetric(content, ['Critical Warnings', 'Critical Warning']),
        warnings: findCountMetric(content, ['Warnings', 'Warning']),
    };
    const foundLabelCount = Object.values(labelCounts).some(value => value !== undefined);

    if (foundLabelCount) {
        return {
            errors: labelCounts.errors ?? counts.errors,
            criticalWarnings: labelCounts.criticalWarnings ?? counts.criticalWarnings,
            warnings: labelCounts.warnings ?? counts.warnings,
        };
    }

    return counts.errors + counts.criticalWarnings + counts.warnings > 0 ? counts : undefined;
}

function findCountMetric(content: string, labels: readonly string[]): number | undefined {
    const value = findMetric(content, labels);
    return value === undefined ? undefined : Number.parseInt(value, 10);
}

function formatNanoseconds(value: string): string {
    return `${value} ns`;
}

function formatUtilizationRow(row: UtilizationRow): string {
    const usage = row.available ? `${row.used}/${row.available}` : row.used;
    return row.percent ? `${row.name} ${usage} (${row.percent}%)` : `${row.name} ${usage}`;
}

function normalizeHeader(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function pluralize(count: number, singular: string): string {
    return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function metricPrefixPattern(): string {
    return '(?:^|[\\r\\n|])\\s*';
}

function labelPattern(label: string): string {
    return label.split(/\s+/).map(escapeRegExp).join('\\s+');
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

import path from 'path';
import * as vscode from 'vscode';
import xml2js from 'xml2js';
import { VivadoBlockDesign } from '../models/vivado-block-design';
import { VivadoFile, VivadoFileKind } from '../models/vivado-file';
import { VivadoFileset, VivadoFilesetKind } from '../models/vivado-fileset';
import { VivadoIp } from '../models/vivado-ip';
import { VivadoProject } from '../models/vivado-project';
import { VivadoRun, VivadoRunStatus, VivadoRunType } from '../models/vivado-run';

interface XmlNode {
    $?: Record<string, string | undefined>;
    [key: string]: unknown;
}

export async function loadVivadoProjectFromXpr(xprFile: vscode.Uri): Promise<VivadoProject> {
    const data = await vscode.workspace.fs.readFile(xprFile);
    return parseVivadoProjectXml(Buffer.from(data).toString(), xprFile);
}

export async function parseVivadoProjectXml(xml: string, xprFile: vscode.Uri): Promise<VivadoProject> {
    const parsed = await xml2js.parseStringPromise(xml) as { Project?: XmlNode };
    const projectNode = parsed.Project;

    if (!projectNode) {
        throw new Error('Invalid Vivado project file: missing Project root element.');
    }

    const projectRoot = vscode.Uri.joinPath(xprFile, '..');
    const options = readConfigurationOptions(projectNode);
    const filesets = readFilesets(projectNode, projectRoot);
    const files = filesets.flatMap(fileset => fileset.files);

    return new VivadoProject({
        name: options.get('ProjectName') ?? path.basename(xprFile.fsPath, path.extname(xprFile.fsPath)),
        uri: projectRoot,
        xprFile,
        part: options.get('Part') ?? readFirstRunPart(projectNode),
        boardPart: options.get('BoardPart'),
        topModule: options.get('TopModule'),
        filesets,
        ips: files
            .filter(file => path.extname(file.uri.fsPath).toLowerCase() === '.xci')
            .map(file => new VivadoIp({
                name: path.basename(file.uri.fsPath, path.extname(file.uri.fsPath)),
                uri: file.uri,
            })),
        blockDesigns: files
            .filter(file => path.extname(file.uri.fsPath).toLowerCase() === '.bd')
            .map(file => new VivadoBlockDesign({
                name: path.basename(file.uri.fsPath, path.extname(file.uri.fsPath)),
                uri: file.uri,
            })),
        runs: readRuns(projectNode),
    });
}

function readConfigurationOptions(projectNode: XmlNode): Map<string, string> {
    const options = new Map<string, string>();
    const configuration = firstNode(projectNode.Configuration);

    for (const option of nodeArray(configuration?.Option)) {
        const name = option.$?.Name;
        const value = option.$?.Val;
        if (name && value !== undefined) {
            options.set(name, value);
        }
    }

    return options;
}

function readFilesets(projectNode: XmlNode, projectRoot: vscode.Uri): VivadoFileset[] {
    const fileSetsNode = firstNode(projectNode.FileSets);

    return nodeArray(fileSetsNode?.FileSet).map(filesetNode => {
        const name = filesetNode.$?.Name ?? 'unnamed';
        const kind = mapFilesetKind(filesetNode.$?.Type);

        return new VivadoFileset({
            name,
            kind,
            files: nodeArray(filesetNode.File).flatMap(fileNode => {
                const filePath = fileNode.$?.Path?.trim();

                if (!filePath) {
                    return [];
                }

                return [new VivadoFile({
                    uri: resolveVivadoProjectPath(projectRoot, filePath),
                    kind: mapFileKind(kind, filePath),
                    library: fileNode.$?.Library,
                    filesetName: name,
                })];
            }),
        });
    });
}

function readRuns(projectNode: XmlNode): VivadoRun[] {
    const runsNode = firstNode(projectNode.Runs);

    return nodeArray(runsNode?.Run).map(runNode => new VivadoRun({
        name: runNode.$?.Id ?? runNode.$?.Name ?? 'unnamed',
        type: mapRunType(runNode.$?.Type),
        status: mapRunStatus(runNode.$?.Status),
        strategy: runNode.$?.Strategy,
        parentRunName: runNode.$?.Parent ?? runNode.$?.ParentRun,
    }));
}

function readFirstRunPart(projectNode: XmlNode): string | undefined {
    const runsNode = firstNode(projectNode.Runs);
    return nodeArray(runsNode?.Run).find(runNode => runNode.$?.Part)?.$?.Part;
}

function resolveVivadoProjectPath(projectRoot: vscode.Uri, filePath: string): vscode.Uri {
    const projectRootPath = projectRoot.fsPath;
    const expandedPath = filePath.replace(/\$PPRDIR/g, projectRootPath);
    const resolvedPath = path.isAbsolute(expandedPath)
        ? expandedPath
        : path.join(projectRootPath, expandedPath);

    return vscode.Uri.file(path.normalize(resolvedPath));
}

function mapFilesetKind(type: string | undefined): VivadoFilesetKind {
    switch ((type ?? '').toLowerCase()) {
        case 'designsrcs':
            return VivadoFilesetKind.Sources;
        case 'simulationsrcs':
            return VivadoFilesetKind.Simulation;
        case 'constrs':
            return VivadoFilesetKind.Constraints;
        default:
            return VivadoFilesetKind.Other;
    }
}

function mapFileKind(filesetKind: VivadoFilesetKind, filePath: string | undefined): VivadoFileKind {
    const extension = path.extname(filePath ?? '').toLowerCase();

    if (extension === '.xdc') {
        return VivadoFileKind.Constraint;
    }

    if (extension === '.tcl') {
        return VivadoFileKind.Tcl;
    }

    switch (filesetKind) {
        case VivadoFilesetKind.Sources:
            return VivadoFileKind.DesignSource;
        case VivadoFilesetKind.Simulation:
            return VivadoFileKind.SimulationSource;
        case VivadoFilesetKind.Constraints:
            return VivadoFileKind.Constraint;
        default:
            return VivadoFileKind.Other;
    }
}

function mapRunType(type: string | undefined): VivadoRunType {
    const normalizedType = (type ?? '').toLowerCase();

    if (normalizedType.includes('synth')) {
        return VivadoRunType.Synthesis;
    }

    if (normalizedType.includes('impl') || normalizedType.includes('entiredesign')) {
        return VivadoRunType.Implementation;
    }

    if (normalizedType.includes('sim')) {
        return VivadoRunType.Simulation;
    }

    return VivadoRunType.Other;
}

function mapRunStatus(status: string | undefined): VivadoRunStatus {
    switch ((status ?? '').toLowerCase()) {
        case 'not started':
        case 'not-started':
            return VivadoRunStatus.NotStarted;
        case 'running':
            return VivadoRunStatus.Running;
        case 'complete':
        case 'completed':
            return VivadoRunStatus.Complete;
        case 'failed':
            return VivadoRunStatus.Failed;
        default:
            return VivadoRunStatus.Unknown;
    }
}

function firstNode(value: unknown): XmlNode | undefined {
    return nodeArray(value)[0];
}

function nodeArray(value: unknown): XmlNode[] {
    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return value.filter((entry): entry is XmlNode => typeof entry === 'object' && entry !== null);
    }

    return typeof value === 'object' ? [value as XmlNode] : [];
}

import path from 'path';
import * as vscode from 'vscode';
import { VivadoBlockDesign } from './vivado-block-design';
import { VivadoFile } from './vivado-file';
import { VivadoFileset } from './vivado-fileset';
import { VivadoIp } from './vivado-ip';
import { VivadoReport } from './vivado-report';
import { VivadoRun, VivadoRunType } from './vivado-run';

export interface VivadoProjectOptions {
    name: string;
    uri: vscode.Uri;
    xprFile: vscode.Uri;
    part?: string;
    boardPart?: string;
    topModule?: string;
    filesets?: VivadoFileset[];
    ips?: VivadoIp[];
    blockDesigns?: VivadoBlockDesign[];
    runs?: VivadoRun[];
    reports?: VivadoReport[];
}

export class VivadoProject {
    public name: string;
    public uri: vscode.Uri;
    public xprFile: vscode.Uri;
    public part?: string;
    public boardPart?: string;
    public topModule?: string;
    public filesets: VivadoFileset[];
    public ips: VivadoIp[];
    public blockDesigns: VivadoBlockDesign[];
    public runs: VivadoRun[];
    public reports: VivadoReport[];

    constructor(options: VivadoProjectOptions) {
        this.name = options.name;
        this.uri = options.uri;
        this.xprFile = options.xprFile;
        this.part = options.part;
        this.boardPart = options.boardPart;
        this.topModule = options.topModule;
        this.filesets = options.filesets ?? [];
        this.ips = options.ips ?? [];
        this.blockDesigns = options.blockDesigns ?? [];
        this.runs = options.runs ?? [];
        this.reports = options.reports ?? [];
    }

    public static fromXprUri(
        xprFile: vscode.Uri,
        options: Partial<Omit<VivadoProjectOptions, 'uri' | 'xprFile'>> = {},
    ): VivadoProject {
        const uri = vscode.Uri.joinPath(xprFile, '..');
        const name = options.name ?? path.basename(xprFile.fsPath, path.extname(xprFile.fsPath));

        return new VivadoProject({
            ...options,
            name,
            uri,
            xprFile,
        });
    }

    public get files(): VivadoFile[] {
        return this.filesets.flatMap(fileset => fileset.files);
    }

    public get designSources(): VivadoFile[] {
        return this.filesets.flatMap(fileset => fileset.designSources);
    }

    public get simulationSources(): VivadoFile[] {
        return this.filesets.flatMap(fileset => fileset.simulationSources);
    }

    public get constraints(): VivadoFile[] {
        return this.filesets.flatMap(fileset => fileset.constraints);
    }

    public runsByType(type: VivadoRunType): VivadoRun[] {
        return this.runs.filter(run => run.type === type);
    }
}

import * as vscode from 'vscode';

export enum VivadoReportKind {
    Timing = 'timing',
    Utilization = 'utilization',
    Power = 'power',
    Drc = 'drc',
    Methodology = 'methodology',
    Other = 'other',
}

export interface VivadoReportSummary {
    description: string;
    details?: string[];
}

export interface VivadoReportOptions {
    name: string;
    uri: vscode.Uri;
    kind: VivadoReportKind;
    runName?: string;
    summary?: VivadoReportSummary;
}

export class VivadoReport {
    public name: string;
    public uri: vscode.Uri;
    public kind: VivadoReportKind;
    public runName?: string;
    public summary?: VivadoReportSummary;

    constructor(options: VivadoReportOptions) {
        this.name = options.name;
        this.uri = options.uri;
        this.kind = options.kind;
        this.runName = options.runName;
        this.summary = options.summary;
    }
}

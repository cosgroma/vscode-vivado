import * as vscode from 'vscode';

export enum VivadoFileKind {
    DesignSource = 'design-source',
    SimulationSource = 'simulation-source',
    Constraint = 'constraint',
    Tcl = 'tcl',
    Other = 'other',
}

export interface VivadoFileOptions {
    uri: vscode.Uri;
    kind: VivadoFileKind;
    library?: string;
    filesetName?: string;
}

export class VivadoFile {
    public uri: vscode.Uri;
    public kind: VivadoFileKind;
    public library?: string;
    public filesetName?: string;

    constructor(options: VivadoFileOptions) {
        this.uri = options.uri;
        this.kind = options.kind;
        this.library = options.library;
        this.filesetName = options.filesetName;
    }
}

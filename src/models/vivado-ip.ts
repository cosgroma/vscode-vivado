import * as vscode from 'vscode';

export interface VivadoIpOptions {
    name: string;
    uri: vscode.Uri;
    vendor?: string;
    library?: string;
    version?: string;
    status?: string;
}

export class VivadoIp {
    public name: string;
    public uri: vscode.Uri;
    public vendor?: string;
    public library?: string;
    public version?: string;
    public status?: string;

    constructor(options: VivadoIpOptions) {
        this.name = options.name;
        this.uri = options.uri;
        this.vendor = options.vendor;
        this.library = options.library;
        this.version = options.version;
        this.status = options.status;
    }
}

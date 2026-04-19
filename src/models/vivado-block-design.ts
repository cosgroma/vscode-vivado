import * as vscode from 'vscode';

export interface VivadoBlockDesignOptions {
    name: string;
    uri: vscode.Uri;
    generatedProductsDirectory?: vscode.Uri;
    isOutOfDate?: boolean;
}

export class VivadoBlockDesign {
    public name: string;
    public uri: vscode.Uri;
    public generatedProductsDirectory?: vscode.Uri;
    public isOutOfDate: boolean;

    constructor(options: VivadoBlockDesignOptions) {
        this.name = options.name;
        this.uri = options.uri;
        this.generatedProductsDirectory = options.generatedProductsDirectory;
        this.isOutOfDate = options.isOutOfDate ?? false;
    }
}

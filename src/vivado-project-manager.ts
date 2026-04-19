import { EventEmitter } from 'stream';
import * as vscode from 'vscode';
import { VivadoProject } from './models/vivado-project';
import { OutputConsole } from './output-console';
import { getVivadoSettings, VivadoSettings } from './utils/vivado-settings';
import { loadVivadoProjectFromXpr } from './utils/vivado-xpr';

type VivadoProjectManagerEvents = { 'projectsChanged': [] };

export interface VivadoProjectManagerDependencies {
    findFiles: (include: vscode.GlobPattern, exclude?: vscode.GlobPattern, maxResults?: number) => Thenable<vscode.Uri[]>;
    getSettings: () => VivadoSettings;
    loadProject: (xprFile: vscode.Uri) => Promise<VivadoProject>;
    appendLine: (message: string) => void;
}

export default class VivadoProjectManager extends EventEmitter<VivadoProjectManagerEvents> {
    static #instance: VivadoProjectManager;
    public readonly projects: VivadoProject[] = [];
    private _queueRefresh: boolean = false;
    private _refreshing: boolean = false;
    private readonly dependencies: VivadoProjectManagerDependencies;

    constructor(
        dependencies: Partial<VivadoProjectManagerDependencies> = {},
        autoRefresh: boolean = true,
    ) {
        super();
        this.dependencies = {
            findFiles: vscode.workspace.findFiles.bind(vscode.workspace),
            getSettings: getVivadoSettings,
            loadProject: loadVivadoProjectFromXpr,
            appendLine: message => OutputConsole.instance.appendLine(message),
            ...dependencies,
        };

        if (autoRefresh) {
            this.refresh();
        }
    }

    public static get instance(): VivadoProjectManager {
        if (!VivadoProjectManager.#instance) {
            VivadoProjectManager.#instance = new VivadoProjectManager();
        }

        return VivadoProjectManager.#instance;
    }

    public async getProjects(): Promise<VivadoProject[]> {
        while (this._refreshing) {
            await new Promise(resolve => this.once('projectsChanged', () => resolve(void 0)));
        }

        return this.projects;
    }

    public refresh(): void {
        this._queueRefresh = true;
        this.tryRefresh();
    }

    private async tryRefresh(): Promise<void> {
        if (this._refreshing) {
            return;
        }

        this._refreshing = true;
        this._queueRefresh = false;

        try {
            this.dependencies.appendLine('Refreshing Vivado projects...');
            const newProjects = await this.safeDiscoverProjects();
            this.replaceProjects(newProjects);
            this.dependencies.appendLine('Found ' + this.projects.length + ' Vivado project(s)');
        } finally {
            this._refreshing = false;
            this.emit('projectsChanged');

            if (this._queueRefresh) {
                void this.tryRefresh();
            }
        }
    }

    private async safeDiscoverProjects(): Promise<VivadoProject[]> {
        try {
            return await this.discoverProjects();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.dependencies.appendLine('Error discovering Vivado projects: ' + message);
            return [];
        }
    }

    private async discoverProjects(): Promise<VivadoProject[]> {
        const settings = this.dependencies.getSettings();
        const projectFiles = await this.findProjectFiles(settings.projectSearchGlobs);
        const projects: VivadoProject[] = [];

        await Promise.all(projectFiles.map(async file => {
            try {
                projects.push(await this.dependencies.loadProject(file));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.dependencies.appendLine('Error loading Vivado project: ' + message);
            }
        }));

        return projects;
    }

    private async findProjectFiles(globs: string[]): Promise<vscode.Uri[]> {
        const files: vscode.Uri[] = [];
        const seen = new Set<string>();

        for (const glob of globs) {
            const found = await this.dependencies.findFiles(glob, '**/node_modules/**', 100);
            for (const file of found) {
                if (!seen.has(file.fsPath)) {
                    seen.add(file.fsPath);
                    files.push(file);
                }
            }
        }

        return files;
    }

    private replaceProjects(newProjects: VivadoProject[]): void {
        this.projects.length = 0;
        this.projects.push(...newProjects);
    }

    public dispose(): void {
        this.removeAllListeners();
    }
}

import path from 'path';
import * as vscode from 'vscode';
import { HLSProject } from '../models/hls-project';
import { HLSProjectFile } from '../models/hls-project-file';
import { HLSProjectSolution } from '../models/hls-project-solution';
import { VivadoFile } from '../models/vivado-file';
import { VivadoProject } from '../models/vivado-project';
import { VivadoReport } from '../models/vivado-report';
import { VivadoRun, VivadoRunStatus, VivadoRunType } from '../models/vivado-run';
import ProjectManager from '../project-manager';
import VivadoProjectManager from '../vivado-project-manager';

const startIconPath = new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('debugIcon.startForeground'));
const stopIconPath = new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('debugIcon.stopForeground'));
const loadingIconPath = new vscode.ThemeIcon('loading~spin');

interface ProjectsProvider<TProject> {
    on(event: 'projectsChanged', listener: () => void): unknown;
    getProjects(): Promise<TProject[]>;
}

class TreeItem extends vscode.TreeItem {
    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None) {
        super(label, collapsibleState);
    }

    public getChildren(): Thenable<TreeItem[]> {
        return Promise.resolve([]);
    }
}

class ProjectTreeItem extends TreeItem {
    public readonly project: HLSProject;

    private readonly _sourceItem: ProjectSourceItem;
    private readonly _testBenchItem: ProjectTestBenchItem;
    private readonly _solutionItems: SolutionTreeItem[] = [];

    constructor(project: HLSProject) {
        super(project.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.project = project;
        this.label = project.name;
        this.tooltip = project.uri.fsPath;
        this.resourceUri = project.uri;

        this._sourceItem = new ProjectSourceItem(this.project);
        this._testBenchItem = new ProjectTestBenchItem(this.project);
        this._solutionItems.push(...this.project.solutions.map(s => new SolutionTreeItem(this.project, s)));
    }

    public getChildren(): Thenable<TreeItem[]> {
        // Update solutions
        const newSolutions = this.project.solutions;
        // Add new solutions
        for (const solution of newSolutions) {
            if (this._solutionItems.some(s => s.solution === solution)) {
                continue; // Already exists
            } else {
                this._solutionItems.push(new SolutionTreeItem(this.project, solution));
            }
        }

        // Remove solutions that no longer exist
        this._solutionItems.forEach(item => {
            if (!newSolutions.some(s => s === item.solution)) {
                this._solutionItems.splice(this._solutionItems.indexOf(item), 1);
            }
        });

        this._solutionItems.sort((a, b) => a.solution.name.localeCompare(b.solution.name));

        return Promise.resolve([
            this._sourceItem,
            this._testBenchItem,
            ...this._solutionItems
        ]);
    }
}

export class VivadoProjectTreeItem extends TreeItem {
    public project: VivadoProject;

    private readonly _designSourcesItem: VivadoFileCategoryItem;
    private readonly _simulationSourcesItem: VivadoFileCategoryItem;
    private readonly _constraintsItem: VivadoFileCategoryItem;
    private readonly _runsItem: VivadoRunsItem;
    private readonly _reportsItem: VivadoReportsItem;

    constructor(project: VivadoProject) {
        super(`${project.name} (Vivado)`, vscode.TreeItemCollapsibleState.Collapsed);
        this.project = project;
        this.contextValue = 'vivadoProjectItem';
        this.iconPath = new vscode.ThemeIcon('circuit-board');

        this._designSourcesItem = new VivadoFileCategoryItem(
            'Design Sources',
            'vivadoDesignSourcesItem',
            'file-code',
            'vivadoDesignSourceFileItem',
            () => this.project.designSources,
        );
        this._simulationSourcesItem = new VivadoFileCategoryItem(
            'Simulation Sources',
            'vivadoSimulationSourcesItem',
            'beaker',
            'vivadoSimulationSourceFileItem',
            () => this.project.simulationSources,
        );
        this._constraintsItem = new VivadoFileCategoryItem(
            'Constraints',
            'vivadoConstraintsItem',
            'symbol-ruler',
            'vivadoConstraintFileItem',
            () => this.project.constraints,
        );
        this._runsItem = new VivadoRunsItem(() => this.project, () => this.project.runs);
        this._reportsItem = new VivadoReportsItem(() => this.project.reports);

        this.updateProject(project);
    }

    public updateProject(project: VivadoProject): void {
        this.project = project;
        this.label = `${project.name} (Vivado)`;
        this.description = project.part;
        this.tooltip = project.xprFile.fsPath;
        this.resourceUri = project.xprFile;
    }

    public getChildren(): Thenable<TreeItem[]> {
        return Promise.resolve([
            this._designSourcesItem,
            this._simulationSourcesItem,
            this._constraintsItem,
            this._runsItem,
            this._reportsItem,
        ]);
    }
}

class VivadoFileCategoryItem extends TreeItem {
    private readonly _getFiles: () => VivadoFile[];
    private readonly _fileContextValue: string;

    constructor(
        label: string,
        contextValue: string,
        iconId: string,
        fileContextValue: string,
        getFiles: () => VivadoFile[],
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = contextValue;
        this.iconPath = new vscode.ThemeIcon(iconId);
        this._getFiles = getFiles;
        this._fileContextValue = fileContextValue;
    }

    public getChildren(): Thenable<VivadoProjectFileItem[]> {
        return Promise.resolve(this._getFiles()
            .slice()
            .sort((a, b) => path.basename(a.uri.fsPath).localeCompare(path.basename(b.uri.fsPath)))
            .map(file => new VivadoProjectFileItem(file, this._fileContextValue)));
    }
}

export class VivadoProjectFileItem extends TreeItem {
    public readonly file: VivadoFile;

    constructor(file: VivadoFile, contextValue: string) {
        super(path.basename(file.uri.fsPath));
        this.file = file;
        this.contextValue = contextValue;
        this.resourceUri = file.uri;
        this.description = file.filesetName;
        this.iconPath = new vscode.ThemeIcon('file-code');
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [file.uri],
        };
    }
}

class VivadoRunsItem extends TreeItem {
    private readonly _getProject: () => VivadoProject;
    private readonly _getRuns: () => VivadoRun[];

    constructor(getProject: () => VivadoProject, getRuns: () => VivadoRun[]) {
        super('Runs', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'vivadoRunsItem';
        this.iconPath = new vscode.ThemeIcon('run-all');
        this._getProject = getProject;
        this._getRuns = getRuns;
    }

    public getChildren(): Thenable<VivadoRunTreeItem[]> {
        return Promise.resolve(this._getRuns()
            .slice()
            .sort(compareVivadoRuns)
            .map(run => new VivadoRunTreeItem(this._getProject(), run)));
    }
}

export class VivadoRunTreeItem extends TreeItem {
    public readonly project: VivadoProject;
    public readonly run: VivadoRun;

    constructor(project: VivadoProject, run: VivadoRun) {
        super(run.name);
        this.project = project;
        this.run = run;
        this.contextValue = contextValueForRunType(run.type);
        this.description = `${formatRunType(run.type)}: ${formatRunStatus(run.status)}`;
        this.tooltip = [
            `Run: ${run.name}`,
            `Type: ${formatRunType(run.type)}`,
            `Status: ${formatRunStatus(run.status)}`,
            run.strategy ? `Strategy: ${run.strategy}` : undefined,
            run.parentRunName ? `Parent: ${run.parentRunName}` : undefined,
        ].filter((line): line is string => Boolean(line)).join('\n');
        this.iconPath = iconForRunStatus(run.status);
    }
}

function contextValueForRunType(type: VivadoRunType): string {
    switch (type) {
        case VivadoRunType.Synthesis:
            return 'vivadoSynthesisRunItem';
        case VivadoRunType.Implementation:
            return 'vivadoImplementationRunItem';
        default:
            return 'vivadoRunItem';
    }
}

class VivadoReportsItem extends TreeItem {
    private readonly _getReports: () => VivadoReport[];

    constructor(getReports: () => VivadoReport[]) {
        super('Reports', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'vivadoReportsItem';
        this.iconPath = new vscode.ThemeIcon('graph');
        this._getReports = getReports;
    }

    public getChildren(): Thenable<VivadoReportTreeItem[]> {
        return Promise.resolve(this._getReports()
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(report => new VivadoReportTreeItem(report)));
    }
}

export class VivadoReportTreeItem extends TreeItem {
    public readonly report: VivadoReport;

    constructor(report: VivadoReport) {
        super(report.name);
        this.report = report;
        this.contextValue = 'vivadoReportItem';
        this.description = report.summary?.description ?? report.runName ?? report.kind;
        this.tooltip = buildReportTooltip(report);
        this.resourceUri = report.uri;
        this.iconPath = new vscode.ThemeIcon('graph');
        this.command = {
            command: 'vscode.open',
            title: 'Open Report',
            arguments: [report.uri],
        };
    }
}

function buildReportTooltip(report: VivadoReport): string {
    return [
        `Report: ${report.name}`,
        `Kind: ${report.kind}`,
        report.runName ? `Run: ${report.runName}` : undefined,
        report.summary?.description ? `Summary: ${report.summary.description}` : undefined,
        ...(report.summary?.details ?? []),
        report.uri.fsPath,
    ].filter((line): line is string => line !== undefined).join('\n');
}

export class ProjectFileItem extends TreeItem {
    public readonly project: HLSProject;

    constructor(file: HLSProjectFile, project: HLSProject) {
        super(path.basename(file.name));
        this.project = project;
        this.resourceUri = file.getUri(project.uri);
        this.contextValue = file.tb ? 'projectTestBenchFileItem' : 'projectSourceFileItem';
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [this.resourceUri]
        };
    }
}

export class ProjectSourceItem extends TreeItem {
    public readonly project: HLSProject;

    constructor(project: HLSProject) {
        super("Source", vscode.TreeItemCollapsibleState.Collapsed);
        this.project = project;
        this.resourceUri = vscode.Uri.file("src");
        this.contextValue = 'projectSourceItem';
    }

    public getChildren(): Thenable<ProjectFileItem[]> {
        return Promise.resolve(this.project.files
            .filter(f => !f.tb)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(f => new ProjectFileItem(f, this.project)));
    }
}

export class ProjectTestBenchItem extends TreeItem {
    public readonly project: HLSProject;

    constructor(project: HLSProject) {
        super("Test Bench", vscode.TreeItemCollapsibleState.Collapsed);
        this.project = project;
        this.resourceUri = vscode.Uri.file("test");
        this.contextValue = 'projectTestBenchItem';
    }

    public getChildren(): Thenable<ProjectFileItem[]> {
        return Promise.resolve(this.project.files
            .filter(f => f.tb)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(f => new ProjectFileItem(f, this.project)));
    }
}

class SolutionTreeItem extends TreeItem {
    private readonly _project: HLSProject;
    public readonly solution: HLSProjectSolution;

    constructor(project: HLSProject, solution: HLSProjectSolution) {
        super(solution.name, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('folder');
        this._project = project;
        this.solution = solution;
    }

    public getChildren(): Thenable<TreeItem[]> {
        return Promise.resolve([
            new CsimTreeItem(this._project, this.solution),
            new CsynthTreeItem(this._project, this.solution),
            new CosimTreeItem(this._project, this.solution)
        ]);
    }
}

class CsimTreeItem extends TreeItem {
    private _project: HLSProject;
    private _solution: HLSProjectSolution;

    constructor(project: HLSProject, solution: HLSProjectSolution) {
        super("C SIMULATION", vscode.TreeItemCollapsibleState.Expanded);
        this._project = project;
        this._solution = solution;
    }

    public getChildren(): Thenable<TreeItem[]> {
        return Promise.resolve([
            new RunCsimTreeItem(this._project, this._solution),
        ]);
    }
}

class RunCsimTreeItem extends TreeItem {
    private _project: HLSProject;
    private _solution: HLSProjectSolution;
    constructor(project: HLSProject, solution: HLSProjectSolution) {
        const title = 'Run C Simulation';

        super(title);
        this._project = project;
        this._solution = solution;

        if (vscode.tasks.taskExecutions.some(e => e.task.name === this._solution.buildCsimTaskName(project)) ||
            vscode.debug.activeDebugSession?.name === this._solution.debugCsimTaskName(project)) {
            this.iconPath = stopIconPath;
            this.command = {
                title: `Stop ${title}`,
                command: 'vitis-hls-ide.projects.stopCsim',
                arguments: [this._project, this._solution]
            };
        } else if (vscode.tasks.taskExecutions.some(e => e.task.source === "Vitis HLS IDE") || vscode.debug.activeDebugSession) {
            this.iconPath = loadingIconPath;
        } else {
            this.iconPath = startIconPath;
            this.command = {
                title: title,
                command: 'vitis-hls-ide.projects.runCsim',
                arguments: [this._project, this._solution]
            };
        }
    }
}

class CsynthTreeItem extends TreeItem {
    private _project: HLSProject;
    private _solution: HLSProjectSolution;

    constructor(project: HLSProject, solution: HLSProjectSolution) {
        super("C SYNTHESIS", vscode.TreeItemCollapsibleState.Expanded);
        this._project = project;
        this._solution = solution;
    }

    public getChildren(): Thenable<TreeItem[]> {
        return Promise.resolve([
            new RunCsynthTreeItem(this._project, this._solution),
        ]);
    }
}

class RunCsynthTreeItem extends TreeItem {
    private _project: HLSProject;
    private _solution: HLSProjectSolution;
    constructor(project: HLSProject, solution: HLSProjectSolution) {
        const title = 'Run C Synthesis';

        super(title);
        this._project = project;
        this._solution = solution;

        if (vscode.tasks.taskExecutions.some(e => e.task.name === this._solution.csynthTaskName(project))) {
            this.iconPath = stopIconPath;
            this.command = {
                title: `Stop ${title}`,
                command: 'vitis-hls-ide.projects.stopCsynth',
                arguments: [this._project, this._solution]
            };
        } else if (vscode.tasks.taskExecutions.some(e => e.task.source === "Vitis HLS IDE") || vscode.debug.activeDebugSession) {
            this.iconPath = loadingIconPath;
        } else {
            this.iconPath = startIconPath;
            this.command = {
                title: title,
                command: 'vitis-hls-ide.projects.runCsynth',
                arguments: [this._project, this._solution]
            };
        }
    }
}

class CosimTreeItem extends TreeItem {
    private _project: HLSProject;
    private _solution: HLSProjectSolution;

    constructor(project: HLSProject, solution: HLSProjectSolution, collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Expanded) {
        super("C/RTL COSIMULATION", collapsibleState);
        this._project = project;
        this._solution = solution;
    }

    public getChildren(): Thenable<TreeItem[]> {
        return Promise.resolve([
            new RunCosimTreeItem(this._project, this._solution),
        ]);
    }
}

class RunCosimTreeItem extends TreeItem {
    private _project: HLSProject;
    private _solution: HLSProjectSolution;
    constructor(project: HLSProject, solution: HLSProjectSolution) {
        const title = 'Run Cosimulation';

        super(title);
        this._project = project;
        this._solution = solution;

        if (vscode.tasks.taskExecutions.some(e => e.task.name === this._solution.cosimTaskName(project))) {
            this.iconPath = stopIconPath;
            this.command = {
                title: `Stop ${title}`,
                command: 'vitis-hls-ide.projects.stopCosim',
                arguments: [this._project, this._solution]
            };
        } else if (vscode.tasks.taskExecutions.some(e => e.task.source === "Vitis HLS IDE") || vscode.debug.activeDebugSession) {
            this.iconPath = loadingIconPath;
        } else {
            this.iconPath = startIconPath;
            this.command = {
                title: title,
                command: 'vitis-hls-ide.projects.runCosim',
                arguments: [this._project, this._solution]
            };
        }
    }
}

export default class ProjectsViewTreeProvider implements vscode.TreeDataProvider<TreeItem> {

    private readonly _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
    public readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private _disposables: vscode.Disposable[] = [];
    private readonly _hlsChildren: ProjectTreeItem[] = [];
    private readonly _vivadoChildren: VivadoProjectTreeItem[] = [];
    private readonly _hlsProjectManager: ProjectsProvider<HLSProject>;
    private readonly _vivadoProjectManager: ProjectsProvider<VivadoProject>;

    constructor(
        hlsProjectManager: ProjectsProvider<HLSProject> = ProjectManager.instance,
        vivadoProjectManager: ProjectsProvider<VivadoProject> = VivadoProjectManager.instance,
    ) {
        this._hlsProjectManager = hlsProjectManager;
        this._vivadoProjectManager = vivadoProjectManager;

        this._hlsProjectManager.on('projectsChanged', () => this._onDidChangeTreeData.fire());
        this._vivadoProjectManager.on('projectsChanged', () => this._onDidChangeTreeData.fire());
        this._disposables = [
            vscode.tasks.onDidStartTask(() => this._onDidChangeTreeData.fire()),
            vscode.tasks.onDidEndTask(() => this._onDidChangeTreeData.fire()),
            vscode.debug.onDidChangeActiveDebugSession(() => this._onDidChangeTreeData.fire()),
        ];
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (element) {
            return element.getChildren();
        } else {
            const [hlsProjects, vivadoProjects] = await Promise.all([
                this._hlsProjectManager.getProjects(),
                this._vivadoProjectManager.getProjects(),
            ]);

            this.syncHlsProjects(hlsProjects);
            this.syncVivadoProjects(vivadoProjects);

            return [
                ...this._hlsChildren,
                ...this._vivadoChildren,
            ];
        }
    }

    private syncHlsProjects(newProjects: HLSProject[]): void {
        for (const project of newProjects) {
            if (!this._hlsChildren.some(child => child.project.uri.toString() === project.uri.toString())) {
                this._hlsChildren.push(new ProjectTreeItem(project));
            }
        }

        for (let i = this._hlsChildren.length - 1; i >= 0; i--) {
            if (!newProjects.some(project => project.uri.toString() === this._hlsChildren[i].project.uri.toString())) {
                this._hlsChildren.splice(i, 1);
            }
        }

        this._hlsChildren.sort((a, b) => a.project.name.localeCompare(b.project.name));
    }

    private syncVivadoProjects(newProjects: VivadoProject[]): void {
        for (const project of newProjects) {
            const existingChild = this._vivadoChildren.find(child => child.project.xprFile.toString() === project.xprFile.toString());

            if (existingChild) {
                existingChild.updateProject(project);
            } else {
                this._vivadoChildren.push(new VivadoProjectTreeItem(project));
            }
        }

        for (let i = this._vivadoChildren.length - 1; i >= 0; i--) {
            if (!newProjects.some(project => project.xprFile.toString() === this._vivadoChildren[i].project.xprFile.toString())) {
                this._vivadoChildren.splice(i, 1);
            }
        }

        this._vivadoChildren.sort((a, b) => a.project.name.localeCompare(b.project.name));
    }

    public dispose() {
        this._onDidChangeTreeData.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}

function compareVivadoRuns(a: VivadoRun, b: VivadoRun): number {
    const typeComparison = runTypeOrder(a.type) - runTypeOrder(b.type);
    return typeComparison === 0 ? a.name.localeCompare(b.name) : typeComparison;
}

function runTypeOrder(type: VivadoRunType): number {
    switch (type) {
        case VivadoRunType.Synthesis:
            return 0;
        case VivadoRunType.Implementation:
            return 1;
        case VivadoRunType.Simulation:
            return 2;
        default:
            return 3;
    }
}

function formatRunType(type: VivadoRunType): string {
    switch (type) {
        case VivadoRunType.Synthesis:
            return 'synthesis';
        case VivadoRunType.Implementation:
            return 'implementation';
        case VivadoRunType.Simulation:
            return 'simulation';
        default:
            return 'other';
    }
}

function formatRunStatus(status: VivadoRunStatus): string {
    switch (status) {
        case VivadoRunStatus.NotStarted:
            return 'not started';
        case VivadoRunStatus.Running:
            return 'running';
        case VivadoRunStatus.Complete:
            return 'complete';
        case VivadoRunStatus.Failed:
            return 'failed';
        default:
            return 'unknown';
    }
}

function iconForRunStatus(status: VivadoRunStatus): vscode.ThemeIcon {
    switch (status) {
        case VivadoRunStatus.Running:
            return loadingIconPath;
        case VivadoRunStatus.Complete:
            return new vscode.ThemeIcon('check');
        case VivadoRunStatus.Failed:
            return new vscode.ThemeIcon('error');
        case VivadoRunStatus.NotStarted:
            return new vscode.ThemeIcon('circle-outline');
        default:
            return new vscode.ThemeIcon('question');
    }
}

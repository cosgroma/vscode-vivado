/**
 * Tests for ProjectsViewTreeProvider and tree item classes.
 * Closes #26 – Test Projects tree provider structure and run item states.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { HLSProject } from '../../models/hls-project';
import { HLSProjectFile } from '../../models/hls-project-file';
import { HLSProjectSolution } from '../../models/hls-project-solution';
import { VivadoFile, VivadoFileKind } from '../../models/vivado-file';
import { VivadoFileset, VivadoFilesetKind } from '../../models/vivado-fileset';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoReport, VivadoReportKind } from '../../models/vivado-report';
import { VivadoRun, VivadoRunStatus, VivadoRunType } from '../../models/vivado-run';
import ProjectsViewTreeProvider, {
    ProjectFileItem,
    ProjectSourceItem,
    ProjectTestBenchItem,
    VivadoProjectFileItem,
    VivadoProjectTreeItem,
    VivadoReportTreeItem,
    VivadoRunTreeItem,
} from '../../views/projects-tree';

// ── helpers ────────────────────────────────────────────────────────────────

interface TestProjectsProvider<TProject> {
    projects: TProject[];
    listeners: Array<() => void>;
    on(event: 'projectsChanged', listener: () => void): unknown;
    getProjects(): Promise<TProject[]>;
    emitProjectsChanged(): void;
}

type TestTreeNode<TChildren extends vscode.TreeItem[] = vscode.TreeItem[]> = vscode.TreeItem & {
    getChildren(): Thenable<TChildren>;
};

function makeProjectsProvider<TProject>(projects: TProject[] = []): TestProjectsProvider<TProject> {
    const provider: TestProjectsProvider<TProject> = {
        projects,
        listeners: [],
        on: (_event, listener) => {
            provider.listeners.push(listener);
            return provider;
        },
        getProjects: async () => provider.projects,
        emitProjectsChanged: () => provider.listeners.forEach(listener => listener()),
    };

    return provider;
}

function makeProject(name: string, files: HLSProjectFile[] = [], solutions: HLSProjectSolution[] = []): HLSProject {
    const uri = vscode.Uri.file(`/workspace/${name}/hls.app`);
    return new HLSProject(uri, name, 'top', solutions, files);
}

function makeSourceFile(name: string): HLSProjectFile {
    return new HLSProjectFile(name, '0', false, '', '', false);
}

function makeTestBenchFile(name: string): HLSProjectFile {
    return new HLSProjectFile(name, '0', true, '', '', false);
}

function makeVivadoProject(
    name: string,
    options: {
        designSources?: string[];
        simulationSources?: string[];
        constraints?: string[];
        runs?: VivadoRun[];
        reports?: VivadoReport[];
        part?: string;
    } = {},
): VivadoProject {
    const root = vscode.Uri.file(`/workspace/${name}`);
    const file = (filePath: string, kind: VivadoFileKind, filesetName: string) => new VivadoFile({
        uri: vscode.Uri.file(`/workspace/${name}/${filePath}`),
        kind,
        filesetName,
    });

    return new VivadoProject({
        name,
        uri: root,
        xprFile: vscode.Uri.file(`/workspace/${name}/${name}.xpr`),
        part: options.part ?? 'xc7a35tcpg236-1',
        topModule: 'top',
        filesets: [
            new VivadoFileset({
                name: 'sources_1',
                kind: VivadoFilesetKind.Sources,
                files: (options.designSources ?? ['rtl/top.sv'])
                    .map(filePath => file(filePath, VivadoFileKind.DesignSource, 'sources_1')),
            }),
            new VivadoFileset({
                name: 'sim_1',
                kind: VivadoFilesetKind.Simulation,
                files: (options.simulationSources ?? ['sim/top_tb.sv'])
                    .map(filePath => file(filePath, VivadoFileKind.SimulationSource, 'sim_1')),
            }),
            new VivadoFileset({
                name: 'constrs_1',
                kind: VivadoFilesetKind.Constraints,
                files: (options.constraints ?? ['constraints/top.xdc'])
                    .map(filePath => file(filePath, VivadoFileKind.Constraint, 'constrs_1')),
            }),
        ],
        runs: options.runs ?? [
            new VivadoRun({
                name: 'synth_1',
                type: VivadoRunType.Synthesis,
                status: VivadoRunStatus.Complete,
            }),
            new VivadoRun({
                name: 'impl_1',
                type: VivadoRunType.Implementation,
                status: VivadoRunStatus.Running,
                parentRunName: 'synth_1',
            }),
        ],
        reports: options.reports ?? [
            new VivadoReport({
                name: 'timing_summary.rpt',
                uri: vscode.Uri.file(`/workspace/${name}/reports/timing_summary.rpt`),
                kind: VivadoReportKind.Timing,
                runName: 'impl_1',
            }),
        ],
    });
}

// ── ProjectSourceItem ──────────────────────────────────────────────────────

suite('ProjectSourceItem', () => {
    test('label is "Source"', () => {
        const project = makeProject('proj');
        const item = new ProjectSourceItem(project);
        assert.strictEqual(item.label, 'Source');
    });

    test('contextValue is projectSourceItem', () => {
        const project = makeProject('proj');
        const item = new ProjectSourceItem(project);
        assert.strictEqual(item.contextValue, 'projectSourceItem');
    });

    test('collapsibleState is Collapsed', () => {
        const project = makeProject('proj');
        const item = new ProjectSourceItem(project);
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    });

    test('getChildren returns only non-tb files', async () => {
        const files = [
            makeSourceFile('src/a.cpp'),
            makeTestBenchFile('../../tb/tb_a.cpp'),
            makeSourceFile('src/b.cpp'),
        ];
        const project = makeProject('proj', files);
        const item = new ProjectSourceItem(project);
        const children = await item.getChildren();
        assert.strictEqual(children.length, 2);
        children.forEach(c => assert.ok(c instanceof ProjectFileItem));
    });

    test('getChildren returns files sorted by name', async () => {
        const files = [makeSourceFile('src/z.cpp'), makeSourceFile('src/a.cpp')];
        const project = makeProject('proj', files);
        const item = new ProjectSourceItem(project);
        const children = await item.getChildren();
        const names = children.map(c => (c as ProjectFileItem).resourceUri?.fsPath ?? '');
        assert.ok(names[0] < names[1], 'Children should be sorted ascending by name');
    });

    test('getChildren returns empty array when no source files exist', async () => {
        const project = makeProject('proj');
        const item = new ProjectSourceItem(project);
        const children = await item.getChildren();
        assert.strictEqual(children.length, 0);
    });
});

// ── ProjectTestBenchItem ───────────────────────────────────────────────────

suite('ProjectTestBenchItem', () => {
    test('label is "Test Bench"', () => {
        const project = makeProject('proj');
        const item = new ProjectTestBenchItem(project);
        assert.strictEqual(item.label, 'Test Bench');
    });

    test('contextValue is projectTestBenchItem', () => {
        const project = makeProject('proj');
        const item = new ProjectTestBenchItem(project);
        assert.strictEqual(item.contextValue, 'projectTestBenchItem');
    });

    test('collapsibleState is Collapsed', () => {
        const project = makeProject('proj');
        const item = new ProjectTestBenchItem(project);
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    });

    test('getChildren returns only tb files', async () => {
        const files = [
            makeSourceFile('src/a.cpp'),
            makeTestBenchFile('../../tb/tb_a.cpp'),
        ];
        const project = makeProject('proj', files);
        const item = new ProjectTestBenchItem(project);
        const children = await item.getChildren();
        assert.strictEqual(children.length, 1);
    });

    test('getChildren returns test bench files sorted by name', async () => {
        const files = [
            makeTestBenchFile('../../tb/tb_z.cpp'),
            makeTestBenchFile('../../tb/tb_a.cpp'),
        ];
        const project = makeProject('proj', files);
        const item = new ProjectTestBenchItem(project);
        const children = await item.getChildren();
        const names = children.map(c => (c as ProjectFileItem).resourceUri?.fsPath ?? '');
        assert.ok(names[0] < names[1], 'Test bench children should be sorted ascending');
    });

    test('getChildren returns empty array when no test bench files exist', async () => {
        const project = makeProject('proj');
        const item = new ProjectTestBenchItem(project);
        const children = await item.getChildren();
        assert.strictEqual(children.length, 0);
    });
});

// ── ProjectFileItem ────────────────────────────────────────────────────────

suite('ProjectFileItem', () => {
    test('contextValue for source file is projectSourceFileItem', () => {
        const project = makeProject('proj');
        const file = makeSourceFile('src/main.cpp');
        const item = new ProjectFileItem(file, project);
        assert.strictEqual(item.contextValue, 'projectSourceFileItem');
    });

    test('contextValue for test bench file is projectTestBenchFileItem', () => {
        const project = makeProject('proj');
        const file = makeTestBenchFile('../../tb/tb.cpp');
        const item = new ProjectFileItem(file, project);
        assert.strictEqual(item.contextValue, 'projectTestBenchFileItem');
    });

    test('resourceUri is set and truthy', () => {
        const project = makeProject('proj');
        const file = makeSourceFile('src/main.cpp');
        const item = new ProjectFileItem(file, project);
        assert.ok(item.resourceUri, 'resourceUri should be set');
    });

    test('command is set to vscode.open', () => {
        const project = makeProject('proj');
        const file = makeSourceFile('src/main.cpp');
        const item = new ProjectFileItem(file, project);
        assert.strictEqual(item.command?.command, 'vscode.open');
    });

    test('label is basename of file name', () => {
        const project = makeProject('proj');
        const file = makeSourceFile('src/my_module.cpp');
        const item = new ProjectFileItem(file, project);
        assert.strictEqual(item.label, 'my_module.cpp');
    });
});

// ── ProjectsViewTreeProvider ───────────────────────────────────────────────

suite('ProjectsViewTreeProvider', () => {
    let provider: ProjectsViewTreeProvider;
    let hlsProjectsProvider: TestProjectsProvider<HLSProject>;
    let vivadoProjectsProvider: TestProjectsProvider<VivadoProject>;

    setup(() => {
        hlsProjectsProvider = makeProjectsProvider();
        vivadoProjectsProvider = makeProjectsProvider();
        provider = new ProjectsViewTreeProvider(hlsProjectsProvider, vivadoProjectsProvider);
    });

    teardown(() => {
        provider.dispose();
    });

    test('getTreeItem returns the element unchanged', () => {
        const project = makeProject('proj');
        const item = new ProjectSourceItem(project);
        // getTreeItem accepts a vscode.TreeItem; call it directly on the provider.
        const result = provider.getTreeItem(item as unknown as Parameters<typeof provider.getTreeItem>[0]);
        assert.strictEqual(result, item);
    });

    test('getChildren with no argument returns an array', async () => {
        const children = await provider.getChildren();
        assert.ok(Array.isArray(children));
    });

    test('getChildren returns empty array when no projects are loaded', async () => {
        const children = await provider.getChildren();
        assert.strictEqual(children.length, 0);
    });

    test('renders Vivado projects separately from HLS projects', async () => {
        hlsProjectsProvider.projects = [makeProject('demo')];
        vivadoProjectsProvider.projects = [makeVivadoProject('demo')];

        const children = await provider.getChildren();

        assert.deepStrictEqual(children.map(child => child.label), ['demo', 'demo (Vivado)']);
        assert.strictEqual(children[1].contextValue, 'vivadoProjectItem');
    });

    test('Vivado project children expose the minimal project structure', async () => {
        vivadoProjectsProvider.projects = [makeVivadoProject('board')];
        const [vivadoProject] = await provider.getChildren() as VivadoProjectTreeItem[];

        const children = await vivadoProject.getChildren();

        assert.deepStrictEqual(children.map(child => child.label), [
            'Design Sources',
            'Simulation Sources',
            'Constraints',
            'Runs',
            'Reports',
        ]);
        assert.deepStrictEqual(children.map(child => child.contextValue), [
            'vivadoDesignSourcesItem',
            'vivadoSimulationSourcesItem',
            'vivadoConstraintsItem',
            'vivadoRunsItem',
            'vivadoReportsItem',
        ]);
    });

    test('Vivado file buckets return sorted openable files', async () => {
        vivadoProjectsProvider.projects = [makeVivadoProject('board', {
            designSources: ['rtl/z.sv', 'rtl/a.sv'],
        })];
        const [vivadoProject] = await provider.getChildren() as VivadoProjectTreeItem[];
        const [designSources] = await vivadoProject.getChildren();
        const files = await (designSources as TestTreeNode<VivadoProjectFileItem[]>).getChildren();

        assert.deepStrictEqual(files.map(file => file.label), ['a.sv', 'z.sv']);
        assert.strictEqual(files[0].contextValue, 'vivadoDesignSourceFileItem');
        assert.strictEqual(files[0].command?.command, 'vscode.open');
    });

    test('Vivado runs and reports display model metadata', async () => {
        vivadoProjectsProvider.projects = [makeVivadoProject('board')];
        const [vivadoProject] = await provider.getChildren() as VivadoProjectTreeItem[];
        const children = await vivadoProject.getChildren();

        const runs = await (children[3] as TestTreeNode<VivadoRunTreeItem[]>).getChildren();
        const reports = await (children[4] as TestTreeNode<VivadoReportTreeItem[]>).getChildren();

        assert.deepStrictEqual(runs.map(run => run.label), ['synth_1', 'impl_1']);
        assert.strictEqual(runs[0].project, vivadoProjectsProvider.projects[0]);
        assert.strictEqual(runs[0].contextValue, 'vivadoSynthesisRunItem');
        assert.strictEqual(runs[1].contextValue, 'vivadoImplementationRunItem');
        assert.strictEqual(runs[0].description, 'synthesis: complete');
        assert.strictEqual(runs[1].description, 'implementation: running');
        assert.strictEqual(reports[0].label, 'timing_summary.rpt');
        assert.strictEqual(reports[0].description, 'impl_1');
        assert.strictEqual(reports[0].command?.command, 'vscode.open');
    });

    test('Vivado project and category nodes stay stable across refreshes', async () => {
        vivadoProjectsProvider.projects = [makeVivadoProject('board', {
            designSources: ['rtl/old_top.sv'],
        })];
        const [firstProject] = await provider.getChildren() as VivadoProjectTreeItem[];
        const firstCategories = await firstProject.getChildren();

        vivadoProjectsProvider.projects = [makeVivadoProject('board', {
            designSources: ['rtl/new_top.sv'],
        })];
        const [secondProject] = await provider.getChildren() as VivadoProjectTreeItem[];
        const secondCategories = await secondProject.getChildren();
        const [secondDesignSources] = secondCategories;
        const files = await (secondDesignSources as TestTreeNode<VivadoProjectFileItem[]>).getChildren();

        assert.strictEqual(secondProject, firstProject);
        assert.deepStrictEqual(secondCategories, firstCategories);
        assert.deepStrictEqual(files.map(file => file.label), ['new_top.sv']);
    });

    test('empty Vivado categories degrade to empty children', async () => {
        vivadoProjectsProvider.projects = [makeVivadoProject('empty', {
            designSources: [],
            simulationSources: [],
            constraints: [],
            runs: [],
            reports: [],
        })];
        const [vivadoProject] = await provider.getChildren() as VivadoProjectTreeItem[];
        const categories = await vivadoProject.getChildren();

        for (const category of categories) {
            const children = await (category as TestTreeNode).getChildren();
            assert.strictEqual(children.length, 0);
        }
    });

    test('fires tree changes when Vivado projects change', () => {
        let fired = false;
        provider.onDidChangeTreeData(() => { fired = true; });

        vivadoProjectsProvider.emitProjectsChanged();

        assert.strictEqual(fired, true);
    });

    test('onDidChangeTreeData is an event', () => {
        assert.ok(typeof provider.onDidChangeTreeData === 'function');
    });

    test('dispose does not throw', () => {
        assert.doesNotThrow(() => provider.dispose());
    });

    test('dispose can be called twice without throwing', () => {
        assert.doesNotThrow(() => {
            provider.dispose();
            provider.dispose();
        });
    });
});

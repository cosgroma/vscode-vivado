/**
 * Tests for ProjectsViewTreeProvider and tree item classes.
 * Closes #26 – Test Projects tree provider structure and run item states.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { HLSProject } from '../../models/hls-project';
import { HLSProjectFile } from '../../models/hls-project-file';
import { HLSProjectSolution } from '../../models/hls-project-solution';
import ProjectsViewTreeProvider, {
    ProjectFileItem,
    ProjectSourceItem,
    ProjectTestBenchItem,
} from '../../views/projects-tree';

// ── helpers ────────────────────────────────────────────────────────────────

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

    setup(() => {
        provider = new ProjectsViewTreeProvider();
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
        // In the test environment there are no hls.app files, so the manager
        // returns an empty project list.
        const children = await provider.getChildren();
        assert.strictEqual(children.length, 0);
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

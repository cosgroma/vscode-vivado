/**
 * Tests for Vivado project discovery.
 * Covers #8 - Add Vivado project discovery and metadata loading.
 */
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { VivadoProject } from '../models/vivado-project';
import { VivadoSettings } from '../utils/vivado-settings';
import VivadoProjectManager, { VivadoProjectManagerDependencies } from '../vivado-project-manager';

function makeSettings(overrides: Partial<VivadoSettings> = {}): VivadoSettings {
    return {
        vivadoPath: '',
        vivadoExecutablePath: '',
        vivadoSettingsScript: '',
        projectSearchGlobs: ['**/*.xpr'],
        reportsDirectory: 'reports',
        generatedTclDirectory: '.vscode-vivado/tcl',
        preserveRunLogs: true,
        resolvedExecutablePath: '',
        pathEntries: [],
        ...overrides,
    };
}

function makeProject(xprFile: vscode.Uri): VivadoProject {
    return VivadoProject.fromXprUri(xprFile, {
        part: 'xc7a35tcpg236-1',
        topModule: 'counter',
    });
}

function makeManager(dependencies: Partial<VivadoProjectManagerDependencies>): {
    manager: VivadoProjectManager;
    messages: string[];
    findCalls: string[];
} {
    const messages: string[] = [];
    const findCalls: string[] = [];
    const manager = new VivadoProjectManager({
        findFiles: (include) => {
            findCalls.push(include.toString());
            return Promise.resolve([]);
        },
        getSettings: () => makeSettings(),
        loadProject: async file => makeProject(file),
        appendLine: message => messages.push(message),
        ...dependencies,
    }, false);

    return { manager, messages, findCalls };
}

suite('VivadoProjectManager', () => {
    test('discovers .xpr projects using configured globs', async () => {
        const xprFile = vscode.Uri.file(path.join('/workspace', 'demo', 'demo.xpr'));
        const maxResultsValues: Array<number | undefined> = [];
        const { manager, findCalls } = makeManager({
            findFiles: (include, _exclude, maxResults) => {
                findCalls.push(include.toString());
                maxResultsValues.push(maxResults);
                return Promise.resolve([xprFile]);
            },
        });

        manager.refresh();
        const projects = await manager.getProjects();

        assert.deepStrictEqual(findCalls, ['**/*.xpr']);
        assert.deepStrictEqual(maxResultsValues, [undefined]);
        assert.strictEqual(projects.length, 1);
        assert.strictEqual(projects[0].name, 'demo');
        assert.strictEqual(projects, manager.projects);
    });

    test('uses all configured project search globs and deduplicates repeated files', async () => {
        const xprFile = vscode.Uri.file(path.join('/workspace', 'demo', 'demo.xpr'));
        const { manager, findCalls } = makeManager({
            getSettings: () => makeSettings({
                projectSearchGlobs: ['projects/**/*.xpr', '**/*.xpr'],
            }),
            findFiles: (include) => {
                findCalls.push(include.toString());
                return Promise.resolve([xprFile]);
            },
        });

        manager.refresh();
        const projects = await manager.getProjects();

        assert.deepStrictEqual(findCalls, ['projects/**/*.xpr', '**/*.xpr']);
        assert.strictEqual(projects.length, 1);
    });

    test('handles metadata loading failures without dropping valid projects', async () => {
        const goodProject = vscode.Uri.file(path.join('/workspace', 'good', 'good.xpr'));
        const badProject = vscode.Uri.file(path.join('/workspace', 'bad', 'bad.xpr'));
        const { manager, messages } = makeManager({
            findFiles: () => Promise.resolve([goodProject, badProject]),
            loadProject: async file => {
                if (file.fsPath === badProject.fsPath) {
                    throw new Error('malformed xpr');
                }

                return makeProject(file);
            },
        });

        manager.refresh();
        const projects = await manager.getProjects();

        assert.strictEqual(projects.length, 1);
        assert.strictEqual(projects[0].name, 'good');
        assert.ok(messages.some(message => message.includes('Error loading Vivado project: malformed xpr')));
    });

    test('handles discovery search failures without throwing from getProjects', async () => {
        const { manager, messages } = makeManager({
            findFiles: () => Promise.reject(new Error('search failed')),
        });

        manager.refresh();
        const projects = await manager.getProjects();

        assert.deepStrictEqual(projects, []);
        assert.ok(messages.some(message => message.includes('Error discovering Vivado projects: search failed')));
    });

    test('does not require a configured Vivado executable for .xpr discovery', async () => {
        const xprFile = vscode.Uri.file(path.join('/workspace', 'no-vivado', 'no-vivado.xpr'));
        const { manager } = makeManager({
            getSettings: () => makeSettings({
                vivadoPath: '',
                vivadoExecutablePath: '',
                resolvedExecutablePath: '',
                pathEntries: [],
            }),
            findFiles: () => Promise.resolve([xprFile]),
        });

        manager.refresh();
        const projects = await manager.getProjects();

        assert.strictEqual(projects.length, 1);
        assert.strictEqual(projects[0].name, 'no-vivado');
    });

    test('replaces stale project entries on refresh', async () => {
        const firstProject = vscode.Uri.file(path.join('/workspace', 'first', 'first.xpr'));
        const secondProject = vscode.Uri.file(path.join('/workspace', 'second', 'second.xpr'));
        let refreshCount = 0;
        const { manager } = makeManager({
            findFiles: () => {
                refreshCount += 1;
                return Promise.resolve(refreshCount === 1 ? [firstProject] : [secondProject]);
            },
        });

        manager.refresh();
        assert.deepStrictEqual((await manager.getProjects()).map(project => project.name), ['first']);

        manager.refresh();
        assert.deepStrictEqual((await manager.getProjects()).map(project => project.name), ['second']);
    });

    test('fires projectsChanged after refresh completes', async () => {
        const xprFile = vscode.Uri.file(path.join('/workspace', 'demo', 'demo.xpr'));
        const { manager } = makeManager({
            findFiles: () => Promise.resolve([xprFile]),
        });

        let fired = false;
        manager.once('projectsChanged', () => { fired = true; });

        manager.refresh();
        await manager.getProjects();

        assert.strictEqual(fired, true);
    });
});

/**
 * Tests for previewing generated Vivado TCL without executing Vivado.
 * Covers the first implementation slice for #12.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildVivadoCleanRunOutputsTcl } from '../../commands/vivado/clean-run-outputs';
import { buildVivadoBitstreamTcl, vivadoBitstreamActionDefinition } from '../../commands/vivado/generate-bitstream';
import previewVivadoGeneratedTcl, {
    buildVivadoTclPreviewContent,
    previewVivadoGeneratedTclCommandId,
    resolveVivadoTclPreviewActions,
    VivadoTclPreviewQuickPickItem,
} from '../../commands/vivado/preview-generated-tcl';
import { buildVivadoImplementationTcl } from '../../commands/vivado/run-implementation';
import { buildVivadoResetRunTcl } from '../../commands/vivado/reset-run';
import { buildVivadoSynthesisTcl, vivadoSynthesisActionDefinition } from '../../commands/vivado/run-synthesis';
import { vivadoBuildTclActionDefinitions, vivadoTclActionDefinitions } from '../../commands/vivado/tcl-actions';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoRun, VivadoRunStatus, VivadoRunType } from '../../models/vivado-run';

function makeProject(runs: VivadoRun[] = [makeSynthesisRun('synth_1'), makeImplementationRun('impl_1')]): VivadoProject {
    return new VivadoProject({
        name: 'demo',
        uri: vscode.Uri.file('/workspace/demo'),
        xprFile: vscode.Uri.file('/workspace/demo/demo.xpr'),
        runs,
    });
}

function makeSynthesisRun(name: string): VivadoRun {
    return new VivadoRun({
        name,
        type: VivadoRunType.Synthesis,
        status: VivadoRunStatus.NotStarted,
    });
}

function makeImplementationRun(name: string): VivadoRun {
    return new VivadoRun({
        name,
        type: VivadoRunType.Implementation,
        status: VivadoRunStatus.NotStarted,
        parentRunName: 'synth_1',
    });
}

function makeOtherRun(name: string): VivadoRun {
    return new VivadoRun({
        name,
        type: VivadoRunType.Other,
        status: VivadoRunStatus.NotStarted,
    });
}

function makePreviewDependencies(options: {
    pickTitle?: string;
    cancelQuickPick?: boolean;
    onQuickPick?: (items: VivadoTclPreviewQuickPickItem[]) => void;
    onOpenTextDocument?: (options: { language: string; content: string }) => void;
    onShowTextDocument?: (document: vscode.TextDocument) => void;
    onShowErrorMessage?: (message: string) => void;
} = {}) {
    const fakeDocument = { uri: vscode.Uri.parse('untitled:Preview Generated TCL.tcl') } as vscode.TextDocument;

    return {
        showQuickPick: async (items: VivadoTclPreviewQuickPickItem[]) => {
            options.onQuickPick?.(items);

            if (options.cancelQuickPick) {
                return undefined;
            }

            return items.find(item => item.label === options.pickTitle) ?? items[0];
        },
        openTextDocument: async (documentOptions: { language: string; content: string }) => {
            options.onOpenTextDocument?.(documentOptions);
            return fakeDocument;
        },
        showTextDocument: async (document: vscode.TextDocument) => {
            options.onShowTextDocument?.(document);
            return {} as vscode.TextEditor;
        },
        showErrorMessage: async (message: string) => {
            options.onShowErrorMessage?.(message);
            return undefined;
        },
    };
}

suite('Vivado generated TCL preview action registry', () => {
    test('contains the existing build actions in build order', () => {
        assert.deepStrictEqual(
            vivadoBuildTclActionDefinitions.map(action => action.title),
            ['Run Synthesis', 'Run Implementation', 'Generate Bitstream'],
        );
    });

    test('contains run maintenance actions after the current build actions in preview order', () => {
        assert.deepStrictEqual(
            vivadoTclActionDefinitions.map(action => action.title),
            ['Run Synthesis', 'Run Implementation', 'Generate Bitstream', 'Reset Run', 'Clean Run Outputs'],
        );
    });
});

suite('Vivado generated TCL preview action resolution', () => {
    test('offers all current build actions for a project target', () => {
        const project = makeProject();

        assert.deepStrictEqual(
            resolveVivadoTclPreviewActions(project).map(action => `${action.definition.title}:${action.run.name}`),
            [
                'Run Synthesis:synth_1',
                'Run Implementation:impl_1',
                'Generate Bitstream:impl_1',
            ],
        );
    });

    test('offers synthesis and reset actions for an explicit synthesis run target', () => {
        const project = makeProject();
        const run = project.runs[0];

        assert.deepStrictEqual(
            resolveVivadoTclPreviewActions({ project, run }).map(action => action.definition.title),
            ['Run Synthesis', 'Reset Run', 'Clean Run Outputs'],
        );
    });

    test('offers implementation, bitstream, and maintenance actions for an explicit implementation run target', () => {
        const project = makeProject();
        const run = project.runs[1];

        assert.deepStrictEqual(
            resolveVivadoTclPreviewActions({ project, run }).map(action => action.definition.title),
            ['Run Implementation', 'Generate Bitstream', 'Reset Run', 'Clean Run Outputs'],
        );
    });

    test('rejects targets with no supported generated TCL actions', () => {
        const project = makeProject([makeOtherRun('sim_like')]);

        assert.throws(
            () => resolveVivadoTclPreviewActions({ project, run: project.runs[0] }),
            /No generated TCL actions/,
        );
    });
});

suite('Vivado generated TCL preview content', () => {
    test('adds a preview-only header to the generated TCL body', () => {
        const project = makeProject();
        const run = project.runs[0];

        assert.strictEqual(
            buildVivadoTclPreviewContent(vivadoSynthesisActionDefinition, project, run),
            [
                '# Generated by VS Code Vivado.',
                '# Preview only. This script has not been executed.',
                '# Action: Run Synthesis',
                '# Project: demo',
                '# Run: synth_1',
                '',
                buildVivadoSynthesisTcl(project, run),
                '',
            ].join('\n'),
        );
    });

    test('labels destructive generated TCL previews when the action declares it', () => {
        const project = makeProject();
        const run = project.runs[1];

        assert.ok(
            buildVivadoTclPreviewContent(
                { ...vivadoBitstreamActionDefinition, destructive: true },
                project,
                run,
            ).includes('# Destructive: Yes'),
        );
    });
});

suite('previewVivadoGeneratedTcl', () => {
    test('opens the selected generated TCL action from a project quick pick', async () => {
        const project = makeProject();
        const run = project.runs[1];
        let quickPickLabels: string[] = [];
        let openedOptions: { language: string; content: string } | undefined;
        let shownDocument: vscode.TextDocument | undefined;

        const result = await previewVivadoGeneratedTcl(project, {
            dependencies: makePreviewDependencies({
                pickTitle: 'Generate Bitstream',
                onQuickPick: items => {
                    quickPickLabels = items.map(item => item.label);
                },
                onOpenTextDocument: options => {
                    openedOptions = options;
                },
                onShowTextDocument: document => {
                    shownDocument = document;
                },
            }),
        });

        assert.strictEqual(result, true);
        assert.deepStrictEqual(quickPickLabels, ['Run Synthesis', 'Run Implementation', 'Generate Bitstream']);
        assert.strictEqual(openedOptions?.language, 'tcl');
        assert.strictEqual(
            openedOptions?.content,
            buildVivadoTclPreviewContent(vivadoBitstreamActionDefinition, project, run),
        );
        assert.ok(openedOptions?.content.endsWith(`${buildVivadoBitstreamTcl(project, run)}\n`));
        assert.strictEqual(shownDocument?.uri.scheme, 'untitled');
    });

    test('opens reset from an explicit run quick pick', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let quickPickLabels: string[] = [];
        let openedContent = '';

        const result = await previewVivadoGeneratedTcl({ project, run }, {
            dependencies: makePreviewDependencies({
                pickTitle: 'Reset Run',
                onQuickPick: items => {
                    quickPickLabels = items.map(item => item.label);
                },
                onOpenTextDocument: options => {
                    openedContent = options.content;
                },
            }),
        });

        assert.strictEqual(result, true);
        assert.deepStrictEqual(quickPickLabels, ['Run Synthesis', 'Reset Run', 'Clean Run Outputs']);
        assert.ok(openedContent.includes('# Action: Reset Run'));
        assert.ok(openedContent.includes('# Destructive: Yes'));
        assert.ok(openedContent.endsWith(`${buildVivadoResetRunTcl(project, run)}\n`));
    });

    test('opens clean run outputs from an explicit run quick pick', async () => {
        const project = makeProject();
        const run = project.runs[1];
        let quickPickLabels: string[] = [];
        let openedContent = '';

        const result = await previewVivadoGeneratedTcl({ project, run }, {
            dependencies: makePreviewDependencies({
                pickTitle: 'Clean Run Outputs',
                onQuickPick: items => {
                    quickPickLabels = items.map(item => item.label);
                },
                onOpenTextDocument: options => {
                    openedContent = options.content;
                },
            }),
        });

        assert.strictEqual(result, true);
        assert.deepStrictEqual(quickPickLabels, ['Run Implementation', 'Generate Bitstream', 'Reset Run', 'Clean Run Outputs']);
        assert.ok(openedContent.includes('# Action: Clean Run Outputs'));
        assert.ok(openedContent.includes('# Destructive: Yes'));
        assert.ok(openedContent.endsWith(`${buildVivadoCleanRunOutputsTcl(project, run)}\n`));
    });

    test('opens the only valid action without showing a quick pick', async () => {
        const project = makeProject();
        const run = project.runs[0];
        let quickPickCalled = false;
        let openedContent = '';

        const result = await previewVivadoGeneratedTcl({ project, run }, {
            actionDefinitions: [vivadoBuildTclActionDefinitions[0]],
            dependencies: makePreviewDependencies({
                onQuickPick: () => {
                    quickPickCalled = true;
                },
                onOpenTextDocument: options => {
                    openedContent = options.content;
                },
            }),
        });

        assert.strictEqual(result, true);
        assert.strictEqual(quickPickCalled, false);
        assert.ok(openedContent.includes('# Action: Run Synthesis'));
        assert.ok(openedContent.endsWith(`${buildVivadoSynthesisTcl(project, run)}\n`));
    });

    test('returns false without opening a document when the quick pick is canceled', async () => {
        const project = makeProject();
        let openTextDocumentCalled = false;

        const result = await previewVivadoGeneratedTcl(project, {
            dependencies: makePreviewDependencies({
                cancelQuickPick: true,
                onOpenTextDocument: () => {
                    openTextDocumentCalled = true;
                },
            }),
        });

        assert.strictEqual(result, false);
        assert.strictEqual(openTextDocumentCalled, false);
    });

    test('reports missing targets without opening a document', async () => {
        let errorMessage = '';
        let openTextDocumentCalled = false;

        const result = await previewVivadoGeneratedTcl(undefined, {
            dependencies: makePreviewDependencies({
                onOpenTextDocument: () => {
                    openTextDocumentCalled = true;
                },
                onShowErrorMessage: message => {
                    errorMessage = message;
                },
            }),
        });

        assert.strictEqual(result, false);
        assert.strictEqual(openTextDocumentCalled, false);
        assert.ok(errorMessage.includes('Select a Vivado project or run'));
    });

    test('uses the same generated TCL body as implementation execution', async () => {
        const project = makeProject();
        const run = project.runs[1];
        let openedContent = '';

        await previewVivadoGeneratedTcl({ project, run }, {
            actionDefinitions: [vivadoBuildTclActionDefinitions[1]],
            dependencies: makePreviewDependencies({
                onOpenTextDocument: options => {
                    openedContent = options.content;
                },
            }),
        });

        assert.ok(openedContent.endsWith(`${buildVivadoImplementationTcl(project, run)}\n`));
    });
});

suite('Vivado generated TCL preview package contribution', () => {
    test('contributes Preview Generated TCL only to supported Vivado tree items', () => {
        const pkg = require('../../../package.json');
        const command = pkg.contributes.commands.find((entry: { command: string }) => entry.command === previewVivadoGeneratedTclCommandId);
        const paletteEntry = pkg.contributes.menus.commandPalette.find((entry: { command: string }) => entry.command === previewVivadoGeneratedTclCommandId);
        const contextEntries = pkg.contributes.menus['view/item/context'].filter((entry: { command: string }) => entry.command === previewVivadoGeneratedTclCommandId);

        assert.strictEqual(command.title, 'Preview Generated TCL');
        assert.strictEqual(paletteEntry.when, 'false');
        assert.deepStrictEqual(
            contextEntries.map((entry: { when: string }) => entry.when).sort(),
            [
                'view == projectsView && viewItem == vivadoImplementationRunItem',
                'view == projectsView && viewItem == vivadoProjectItem',
                'view == projectsView && viewItem == vivadoSynthesisRunItem',
            ],
        );
    });
});

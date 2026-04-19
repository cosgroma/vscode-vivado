import * as vscode from 'vscode';
import { vivadoTaskSource } from '../../constants';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoRun, VivadoRunType } from '../../models/vivado-run';
import VivadoProjectManager from '../../vivado-project-manager';
import { vivadoRun, VivadoRunOptions } from '../../utils/vivado-run';

export interface VivadoRunCommandTarget {
    project?: VivadoProject;
    run?: VivadoRun;
}

export interface RunVivadoCommandDependencies {
    vivadoRun: (startPath: vscode.Uri, tcl: string, taskName: string, options?: VivadoRunOptions) => Promise<number | undefined>;
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
    showWarningMessage: (message: string, options: vscode.MessageOptions, ...items: string[]) => Thenable<string | undefined>;
    getTaskExecutions: () => readonly vscode.TaskExecution[];
    refreshVivadoProjects: () => void | Promise<void>;
}

export interface RunVivadoCommandOptions {
    dependencies?: Partial<RunVivadoCommandDependencies>;
}

export interface ResolvedVivadoRunCommand {
    project: VivadoProject;
    run: VivadoRun;
}

export interface VivadoTclActionDefinition {
    actionId: string;
    title: string;
    actionName: string;
    taskActionName: string;
    runType: VivadoRunType;
    runTypes?: readonly VivadoRunType[];
    runDescription?: string;
    defaultRunName: string;
    supportsProjectTarget: boolean;
    supportsRunTarget: boolean;
    destructive?: boolean;
    confirmation?: (project: VivadoProject, run: VivadoRun) => VivadoRunCommandConfirmation;
    buildTcl: (project: VivadoProject, run: VivadoRun) => string;
}

export type VivadoRunCommandDefinition = VivadoTclActionDefinition;

export interface VivadoRunCommandConfirmation {
    message: string;
    confirmLabel: string;
    detail?: string;
}

export async function runVivadoProjectCommand(
    target: VivadoProject | VivadoRunCommandTarget | undefined,
    definition: VivadoRunCommandDefinition,
    options: RunVivadoCommandOptions = {},
): Promise<boolean> {
    const dependencies = resolveDependencies(options.dependencies);

    try {
        const { project, run } = resolveVivadoRunTarget(target, definition);
        ensureNoActiveVivadoTask(dependencies.getTaskExecutions(), definition.actionName);

        const confirmation = definition.confirmation?.(project, run);
        if (confirmation) {
            const selection = await dependencies.showWarningMessage(
                confirmation.message,
                { modal: true, detail: confirmation.detail },
                confirmation.confirmLabel,
            );

            if (selection !== confirmation.confirmLabel) {
                return false;
            }
        }

        const taskName = buildVivadoRunTaskName(definition.taskActionName, project, run);
        const exitCode = await dependencies.vivadoRun(
            project.uri,
            definition.buildTcl(project, run),
            taskName,
            {
                presentationOptions: {
                    reveal: vscode.TaskRevealKind.Always,
                    panel: vscode.TaskPanelKind.Shared,
                    clear: false,
                },
            },
        );

        if (exitCode === 0) {
            await dependencies.showInformationMessage(
                `Vivado ${definition.actionName} completed for ${project.name}/${run.name}.`,
            );
            await dependencies.refreshVivadoProjects();
            return true;
        }

        if (exitCode === undefined) {
            return false;
        }

        await dependencies.showErrorMessage(
            `Vivado ${definition.actionName} failed for ${project.name}/${run.name}. ` +
            'Review the Vivado task output and generated TCL script.',
        );
        return false;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await dependencies.showErrorMessage(message);
        return false;
    }
}

export function resolveVivadoRunTarget(
    target: VivadoProject | VivadoRunCommandTarget | undefined,
    definition: Pick<VivadoRunCommandDefinition, 'actionName' | 'runType' | 'runTypes' | 'runDescription' | 'defaultRunName' | 'supportsProjectTarget' | 'supportsRunTarget'>,
): ResolvedVivadoRunCommand {
    const runDescription = getRunDescription(definition);

    if (!target) {
        throw new Error(
            `Select a Vivado project or ${articleFor(runDescription)} ${runDescription} run in the Projects view ` +
            `before running ${definition.actionName}.`,
        );
    }

    if (target instanceof VivadoProject) {
        if (!definition.supportsProjectTarget) {
            throw new Error(
                `Select ${articleFor(runDescription)} ${runDescription} run in the Projects view ` +
                `before running ${definition.actionName}.`,
            );
        }

        return {
            project: target,
            run: chooseDefaultRun(target, definition),
        };
    }

    if (!(target.project instanceof VivadoProject)) {
        throw new Error(
            `Select a Vivado project or ${articleFor(runDescription)} ${runDescription} run in the Projects view ` +
            `before running ${definition.actionName}.`,
        );
    }

    if (!target.run) {
        if (!definition.supportsProjectTarget) {
            throw new Error(
                `Select ${articleFor(runDescription)} ${runDescription} run in the Projects view ` +
                `before running ${definition.actionName}.`,
            );
        }

        return {
            project: target.project,
            run: chooseDefaultRun(target.project, definition),
        };
    }

    if (!definition.supportsRunTarget || !(target.run instanceof VivadoRun) || !supportsRunType(definition, target.run.type)) {
        const targetDescription = definition.supportsProjectTarget
            ? `${articleFor(runDescription)} ${runDescription} run or Vivado project`
            : `${articleFor(runDescription)} ${runDescription} run`;

        throw new Error(
            `Select ${targetDescription} ` +
            `before running ${definition.actionName}.`,
        );
    }

    return {
        project: target.project,
        run: target.run,
    };
}

export function buildVivadoRunTaskName(taskActionName: string, project: VivadoProject, run: VivadoRun): string {
    return `Vivado: ${taskActionName} ${project.name}/${run.name}`;
}

function supportsRunType(
    definition: Pick<VivadoRunCommandDefinition, 'runType' | 'runTypes'>,
    runType: VivadoRunType,
): boolean {
    return (definition.runTypes ?? [definition.runType]).includes(runType);
}

function chooseDefaultRun(
    project: VivadoProject,
    definition: Pick<VivadoRunCommandDefinition, 'actionName' | 'runType' | 'runDescription' | 'defaultRunName'>,
): VivadoRun {
    const runs = project.runsByType(definition.runType)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
    const run = runs.find(candidate => candidate.name === definition.defaultRunName) ?? runs[0];

    if (!run) {
        throw new Error(`Vivado project ${project.name} has no ${getRunDescription(definition)} runs.`);
    }

    return run;
}

function ensureNoActiveVivadoTask(taskExecutions: readonly vscode.TaskExecution[], actionName: string): void {
    if (taskExecutions.some(execution => execution.task.source === vivadoTaskSource)) {
        throw new Error(`A Vivado task is already running. Wait for it to finish before starting ${actionName}.`);
    }
}

function articleFor(value: string): 'a' | 'an' {
    return /^[aeiou]/i.test(value) ? 'an' : 'a';
}

function getRunDescription(definition: Pick<VivadoRunCommandDefinition, 'actionName' | 'runDescription'>): string {
    return definition.runDescription ?? definition.actionName;
}

function resolveDependencies(dependencies: Partial<RunVivadoCommandDependencies> = {}): RunVivadoCommandDependencies {
    return {
        vivadoRun,
        showErrorMessage: message => vscode.window.showErrorMessage(message),
        showInformationMessage: message => vscode.window.showInformationMessage(message),
        showWarningMessage: (message, options, ...items) => vscode.window.showWarningMessage(message, options, ...items),
        getTaskExecutions: () => vscode.tasks.taskExecutions,
        refreshVivadoProjects: () => VivadoProjectManager.instance.refresh(),
        ...dependencies,
    };
}

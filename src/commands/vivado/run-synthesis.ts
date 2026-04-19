import * as vscode from 'vscode';
import { vivadoTaskSource } from '../../constants';
import { VivadoProject } from '../../models/vivado-project';
import { VivadoRun, VivadoRunType } from '../../models/vivado-run';
import VivadoProjectManager from '../../vivado-project-manager';
import { vivadoRun, VivadoRunOptions } from '../../utils/vivado-run';
import { quoteTclString } from '../../utils/vivado-tcl';

const commandId = 'vscode-vivado.projects.runSynthesis';

export interface VivadoRunCommandTarget {
    project?: VivadoProject;
    run?: VivadoRun;
}

export interface RunVivadoSynthesisDependencies {
    vivadoRun: (startPath: vscode.Uri, tcl: string, taskName: string, options?: VivadoRunOptions) => Promise<number | undefined>;
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
    getTaskExecutions: () => readonly vscode.TaskExecution[];
    refreshVivadoProjects: () => void | Promise<void>;
}

export interface RunVivadoSynthesisOptions {
    dependencies?: Partial<RunVivadoSynthesisDependencies>;
}

interface ResolvedVivadoRunCommand {
    project: VivadoProject;
    run: VivadoRun;
}

export default async function runVivadoSynthesis(
    target: VivadoProject | VivadoRunCommandTarget | undefined,
    options: RunVivadoSynthesisOptions = {},
): Promise<boolean> {
    const dependencies = resolveDependencies(options.dependencies);

    try {
        const { project, run } = resolveSynthesisTarget(target);
        ensureNoActiveVivadoTask(dependencies.getTaskExecutions());

        const taskName = buildVivadoSynthesisTaskName(project, run);
        const exitCode = await dependencies.vivadoRun(
            project.uri,
            buildVivadoSynthesisTcl(project, run),
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
            await dependencies.showInformationMessage(`Vivado synthesis completed for ${project.name}/${run.name}.`);
            await dependencies.refreshVivadoProjects();
            return true;
        }

        if (exitCode === undefined) {
            return false;
        }

        await dependencies.showErrorMessage(
            `Vivado synthesis failed for ${project.name}/${run.name}. Review the Vivado task output and generated TCL script.`,
        );
        return false;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await dependencies.showErrorMessage(message);
        return false;
    }
}

export function buildVivadoSynthesisTcl(project: VivadoProject, run: VivadoRun): string {
    const projectPath = quoteTclString(project.xprFile.fsPath);
    const runName = quoteTclString(run.name);

    return [
        `open_project ${projectPath}`,
        `launch_runs ${runName}`,
        `wait_on_run ${runName}`,
        `if {[get_property PROGRESS [get_runs ${runName}]] != "100%"} {`,
        `    error ${quoteTclString(`Synthesis run ${run.name} did not complete`)}`,
        '}',
        'close_project',
    ].join('\n');
}

export function buildVivadoSynthesisTaskName(project: VivadoProject, run: VivadoRun): string {
    return `Vivado: Synthesis ${project.name}/${run.name}`;
}

export function resolveSynthesisTarget(target: VivadoProject | VivadoRunCommandTarget | undefined): ResolvedVivadoRunCommand {
    if (!target) {
        throw new Error('Select a Vivado project or synthesis run in the Projects view before running synthesis.');
    }

    if (target instanceof VivadoProject) {
        return {
            project: target,
            run: chooseDefaultSynthesisRun(target),
        };
    }

    if (!(target.project instanceof VivadoProject)) {
        throw new Error('Select a Vivado project or synthesis run in the Projects view before running synthesis.');
    }

    if (!target.run) {
        return {
            project: target.project,
            run: chooseDefaultSynthesisRun(target.project),
        };
    }

    if (!(target.run instanceof VivadoRun) || target.run.type !== VivadoRunType.Synthesis) {
        throw new Error('Select a synthesis run or Vivado project before running synthesis.');
    }

    return {
        project: target.project,
        run: target.run,
    };
}

function chooseDefaultSynthesisRun(project: VivadoProject): VivadoRun {
    const synthesisRuns = project.runsByType(VivadoRunType.Synthesis)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
    const run = synthesisRuns.find(candidate => candidate.name === 'synth_1') ?? synthesisRuns[0];

    if (!run) {
        throw new Error(`Vivado project ${project.name} has no synthesis runs.`);
    }

    return run;
}

function ensureNoActiveVivadoTask(taskExecutions: readonly vscode.TaskExecution[]): void {
    if (taskExecutions.some(execution => execution.task.source === vivadoTaskSource)) {
        throw new Error('A Vivado task is already running. Wait for it to finish before starting synthesis.');
    }
}

function resolveDependencies(dependencies: Partial<RunVivadoSynthesisDependencies> = {}): RunVivadoSynthesisDependencies {
    return {
        vivadoRun,
        showErrorMessage: message => vscode.window.showErrorMessage(message),
        showInformationMessage: message => vscode.window.showInformationMessage(message),
        getTaskExecutions: () => vscode.tasks.taskExecutions,
        refreshVivadoProjects: () => VivadoProjectManager.instance.refresh(),
        ...dependencies,
    };
}

export { commandId as runVivadoSynthesisCommandId };

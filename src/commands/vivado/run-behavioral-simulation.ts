import path from 'path';
import * as vscode from 'vscode';
import { vivadoTaskSource } from '../../constants';
import { VivadoFile, VivadoFileKind } from '../../models/vivado-file';
import { VivadoProject } from '../../models/vivado-project';
import VivadoProjectManager from '../../vivado-project-manager';
import { quoteTclString } from '../../utils/vivado-tcl';
import { vivadoRun, VivadoRunOptions } from '../../utils/vivado-run';

const commandId = 'vscode-vivado.projects.runBehavioralSimulation';

export interface VivadoBehavioralSimulationTarget {
    project?: VivadoProject;
    file?: VivadoFile;
}

export interface ResolvedVivadoBehavioralSimulation {
    project: VivadoProject;
    simsetName: string;
    sourceFile?: VivadoFile;
}

export interface RunVivadoBehavioralSimulationDependencies {
    vivadoRun: (startPath: vscode.Uri, tcl: string, taskName: string, options?: VivadoRunOptions) => Promise<number | undefined>;
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
    getTaskExecutions: () => readonly vscode.TaskExecution[];
    refreshVivadoProjects: () => void | Promise<void>;
}

export interface RunVivadoBehavioralSimulationOptions {
    dependencies?: Partial<RunVivadoBehavioralSimulationDependencies>;
}

export default async function runVivadoBehavioralSimulation(
    target: VivadoProject | VivadoBehavioralSimulationTarget | undefined,
    options: RunVivadoBehavioralSimulationOptions = {},
): Promise<boolean> {
    const dependencies = resolveDependencies(options.dependencies);

    try {
        const resolvedTarget = resolveBehavioralSimulationTarget(target);
        ensureNoActiveVivadoTask(dependencies.getTaskExecutions());

        const taskName = buildVivadoBehavioralSimulationTaskName(resolvedTarget.project, resolvedTarget.simsetName);
        const exitCode = await dependencies.vivadoRun(
            resolvedTarget.project.uri,
            buildVivadoBehavioralSimulationTcl(resolvedTarget),
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
                `Vivado behavioral simulation completed for ${resolvedTarget.project.name}/${resolvedTarget.simsetName}.`,
            );
            await dependencies.refreshVivadoProjects();
            return true;
        }

        if (exitCode === undefined) {
            return false;
        }

        await dependencies.showErrorMessage(
            `Vivado behavioral simulation failed for ${resolvedTarget.project.name}/${resolvedTarget.simsetName}. ` +
            'Review the Vivado task output and generated TCL script.',
        );
        return false;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await dependencies.showErrorMessage(message);
        return false;
    }
}

export function resolveBehavioralSimulationTarget(
    target: VivadoProject | VivadoBehavioralSimulationTarget | undefined,
): ResolvedVivadoBehavioralSimulation {
    if (!target) {
        throw new Error('Select a Vivado project or simulation source file in the Projects view before running behavioral simulation.');
    }

    if (target instanceof VivadoProject) {
        return {
            project: target,
            simsetName: chooseDefaultSimulationFileset(target),
        };
    }

    if (!(target.project instanceof VivadoProject)) {
        throw new Error('Select a Vivado project or simulation source file in the Projects view before running behavioral simulation.');
    }

    if (!target.file) {
        return {
            project: target.project,
            simsetName: chooseDefaultSimulationFileset(target.project),
        };
    }

    if (!(target.file instanceof VivadoFile) || target.file.kind !== VivadoFileKind.SimulationSource) {
        throw new Error('Select a Vivado simulation source file before running behavioral simulation from a file target.');
    }

    if (!target.file.filesetName) {
        throw new Error(`Simulation source ${path.basename(target.file.uri.fsPath)} is not associated with a Vivado simulation fileset.`);
    }

    return {
        project: target.project,
        simsetName: target.file.filesetName,
        sourceFile: target.file,
    };
}

export function buildVivadoBehavioralSimulationTcl(target: ResolvedVivadoBehavioralSimulation): string {
    const projectPath = quoteTclString(target.project.xprFile.fsPath);
    const simsetName = quoteTclString(target.simsetName);
    const sourceComment = target.sourceFile
        ? [`# Selected simulation source: ${target.sourceFile.uri.fsPath}`]
        : [];

    return [
        ...sourceComment,
        `open_project ${projectPath}`,
        `set simset_name ${simsetName}`,
        'set simset [get_filesets -quiet $simset_name]',
        'if {[llength $simset] == 0} {',
        `    error ${quoteTclString(`Simulation fileset ${target.simsetName} was not found`)}`,
        '}',
        'current_fileset -simset $simset',
        'launch_simulation -simset $simset_name -mode behavioral',
        'run all',
        'close_sim',
        'close_project',
    ].join('\n');
}

export function buildVivadoBehavioralSimulationTaskName(project: VivadoProject, simsetName: string): string {
    return `Vivado: Behavioral Simulation ${project.name}/${simsetName}`;
}

function chooseDefaultSimulationFileset(project: VivadoProject): string {
    const simulationFilesets = project.simulationFilesets
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
    const fileset = simulationFilesets.find(candidate => candidate.name === 'sim_1') ?? simulationFilesets[0];

    if (!fileset) {
        throw new Error(`Vivado project ${project.name} has no simulation filesets.`);
    }

    return fileset.name;
}

function ensureNoActiveVivadoTask(taskExecutions: readonly vscode.TaskExecution[]): void {
    if (taskExecutions.some(execution => execution.task.source === vivadoTaskSource)) {
        throw new Error('A Vivado task is already running. Wait for it to finish before starting behavioral simulation.');
    }
}

function resolveDependencies(
    dependencies: Partial<RunVivadoBehavioralSimulationDependencies> = {},
): RunVivadoBehavioralSimulationDependencies {
    return {
        vivadoRun,
        showErrorMessage: message => vscode.window.showErrorMessage(message),
        showInformationMessage: message => vscode.window.showInformationMessage(message),
        getTaskExecutions: () => vscode.tasks.taskExecutions,
        refreshVivadoProjects: () => VivadoProjectManager.instance.refresh(),
        ...dependencies,
    };
}

export { commandId as runVivadoBehavioralSimulationCommandId };

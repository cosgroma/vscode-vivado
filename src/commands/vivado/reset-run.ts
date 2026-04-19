import { VivadoProject } from '../../models/vivado-project';
import { VivadoRun, VivadoRunType } from '../../models/vivado-run';
import { quoteTclString } from '../../utils/vivado-tcl';
import {
    buildVivadoRunTaskName,
    ResolvedVivadoRunCommand,
    resolveVivadoRunTarget,
    RunVivadoCommandDependencies,
    RunVivadoCommandOptions,
    runVivadoProjectCommand,
    VivadoRunCommandDefinition,
    VivadoRunCommandTarget,
} from './run-command';

const commandId = 'vscode-vivado.projects.resetRun';

export type ResetVivadoRunDependencies = RunVivadoCommandDependencies;
export type ResetVivadoRunOptions = RunVivadoCommandOptions;

export const vivadoResetRunActionDefinition: VivadoRunCommandDefinition = {
    actionId: 'resetRun',
    title: 'Reset Run',
    actionName: 'reset run',
    taskActionName: 'Reset Run',
    runType: VivadoRunType.Synthesis,
    runTypes: [VivadoRunType.Synthesis, VivadoRunType.Implementation],
    runDescription: 'synthesis or implementation',
    defaultRunName: 'synth_1',
    supportsProjectTarget: false,
    supportsRunTarget: true,
    destructive: true,
    confirmation: (project, run) => ({
        message: `Reset Vivado run "${run.name}" in "${project.name}"?`,
        detail: 'This resets the run state and may invalidate downstream results.',
        confirmLabel: 'Reset Run',
    }),
    buildTcl: buildVivadoResetRunTcl,
};

export default async function resetVivadoRun(
    target: VivadoProject | VivadoRunCommandTarget | undefined,
    options: ResetVivadoRunOptions = {},
): Promise<boolean> {
    return runVivadoProjectCommand(target, vivadoResetRunActionDefinition, options);
}

export function buildVivadoResetRunTcl(project: VivadoProject, run: VivadoRun): string {
    const projectPath = quoteTclString(project.xprFile.fsPath);
    const runName = quoteTclString(run.name);

    return [
        `open_project ${projectPath}`,
        `set selected_run [get_runs ${runName}]`,
        'if {[llength $selected_run] != 1} {',
        `    error ${quoteTclString(`Expected exactly one Vivado run named ${run.name}`)}`,
        '}',
        'reset_runs $selected_run',
        'close_project',
    ].join('\n');
}

export function buildVivadoResetRunTaskName(project: VivadoProject, run: VivadoRun): string {
    return buildVivadoRunTaskName(vivadoResetRunActionDefinition.taskActionName, project, run);
}

export function resolveResetRunTarget(target: VivadoProject | VivadoRunCommandTarget | undefined): ResolvedVivadoRunCommand {
    return resolveVivadoRunTarget(target, vivadoResetRunActionDefinition);
}

export { commandId as resetVivadoRunCommandId };

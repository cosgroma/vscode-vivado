import { VivadoProject } from '../../models/vivado-project';
import { VivadoRun, VivadoRunType } from '../../models/vivado-run';
import { quoteTclString } from '../../utils/vivado-tcl';
import {
    buildVivadoRunTaskName,
    ResolvedVivadoRunCommand,
    RunVivadoCommandDependencies,
    RunVivadoCommandOptions,
    runVivadoProjectCommand,
    resolveVivadoRunTarget,
    VivadoRunCommandDefinition,
    VivadoRunCommandTarget,
} from './run-command';

const commandId = 'vscode-vivado.projects.runImplementation';

export type RunVivadoImplementationDependencies = RunVivadoCommandDependencies;
export type RunVivadoImplementationOptions = RunVivadoCommandOptions;

export const vivadoImplementationActionDefinition: VivadoRunCommandDefinition = {
    actionId: 'runImplementation',
    title: 'Run Implementation',
    actionName: 'implementation',
    taskActionName: 'Implementation',
    runType: VivadoRunType.Implementation,
    defaultRunName: 'impl_1',
    supportsProjectTarget: true,
    supportsRunTarget: true,
    buildTcl: buildVivadoImplementationTcl,
};

export default async function runVivadoImplementation(
    target: VivadoProject | VivadoRunCommandTarget | undefined,
    options: RunVivadoImplementationOptions = {},
): Promise<boolean> {
    return runVivadoProjectCommand(target, vivadoImplementationActionDefinition, options);
}

export function buildVivadoImplementationTcl(project: VivadoProject, run: VivadoRun): string {
    const projectPath = quoteTclString(project.xprFile.fsPath);
    const runName = quoteTclString(run.name);

    return [
        `open_project ${projectPath}`,
        `launch_runs ${runName}`,
        `wait_on_run ${runName}`,
        `if {[get_property PROGRESS [get_runs ${runName}]] != "100%"} {`,
        `    error ${quoteTclString(`Implementation run ${run.name} did not complete`)}`,
        '}',
        'close_project',
    ].join('\n');
}

export function buildVivadoImplementationTaskName(project: VivadoProject, run: VivadoRun): string {
    return buildVivadoRunTaskName('Implementation', project, run);
}

export function resolveImplementationTarget(target: VivadoProject | VivadoRunCommandTarget | undefined): ResolvedVivadoRunCommand {
    return resolveVivadoRunTarget(target, vivadoImplementationActionDefinition);
}

export { commandId as runVivadoImplementationCommandId };

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

const commandId = 'vscode-vivado.projects.runSynthesis';

export type RunVivadoSynthesisDependencies = RunVivadoCommandDependencies;
export type RunVivadoSynthesisOptions = RunVivadoCommandOptions;

export const vivadoSynthesisActionDefinition: VivadoRunCommandDefinition = {
    actionId: 'runSynthesis',
    title: 'Run Synthesis',
    actionName: 'synthesis',
    taskActionName: 'Synthesis',
    runType: VivadoRunType.Synthesis,
    defaultRunName: 'synth_1',
    supportsProjectTarget: true,
    supportsRunTarget: true,
    buildTcl: buildVivadoSynthesisTcl,
};

export default async function runVivadoSynthesis(
    target: VivadoProject | VivadoRunCommandTarget | undefined,
    options: RunVivadoSynthesisOptions = {},
): Promise<boolean> {
    return runVivadoProjectCommand(target, vivadoSynthesisActionDefinition, options);
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
    return buildVivadoRunTaskName('Synthesis', project, run);
}

export function resolveSynthesisTarget(target: VivadoProject | VivadoRunCommandTarget | undefined): ResolvedVivadoRunCommand {
    return resolveVivadoRunTarget(target, vivadoSynthesisActionDefinition);
}

export { commandId as runVivadoSynthesisCommandId };

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

const commandId = 'vscode-vivado.projects.generateBitstream';

export type GenerateVivadoBitstreamDependencies = RunVivadoCommandDependencies;
export type GenerateVivadoBitstreamOptions = RunVivadoCommandOptions;

const bitstreamCommandDefinition: VivadoRunCommandDefinition = {
    actionName: 'bitstream generation',
    taskActionName: 'Bitstream',
    runType: VivadoRunType.Implementation,
    runDescription: 'implementation',
    defaultRunName: 'impl_1',
    buildTcl: buildVivadoBitstreamTcl,
};

export default async function generateVivadoBitstream(
    target: VivadoProject | VivadoRunCommandTarget | undefined,
    options: GenerateVivadoBitstreamOptions = {},
): Promise<boolean> {
    return runVivadoProjectCommand(target, bitstreamCommandDefinition, options);
}

export function buildVivadoBitstreamTcl(project: VivadoProject, run: VivadoRun): string {
    const projectPath = quoteTclString(project.xprFile.fsPath);
    const runName = quoteTclString(run.name);

    return [
        `open_project ${projectPath}`,
        `launch_runs ${runName} -to_step write_bitstream`,
        `wait_on_run ${runName}`,
        `if {[get_property PROGRESS [get_runs ${runName}]] != "100%"} {`,
        `    error ${quoteTclString(`Bitstream run ${run.name} did not complete`)}`,
        '}',
        'close_project',
    ].join('\n');
}

export function buildVivadoBitstreamTaskName(project: VivadoProject, run: VivadoRun): string {
    return buildVivadoRunTaskName('Bitstream', project, run);
}

export function resolveBitstreamTarget(target: VivadoProject | VivadoRunCommandTarget | undefined): ResolvedVivadoRunCommand {
    return resolveVivadoRunTarget(target, bitstreamCommandDefinition);
}

export { commandId as generateVivadoBitstreamCommandId };

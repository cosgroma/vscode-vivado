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

const commandId = 'vscode-vivado.projects.cleanRunOutputs';

export type CleanVivadoRunOutputsDependencies = RunVivadoCommandDependencies;
export type CleanVivadoRunOutputsOptions = RunVivadoCommandOptions;

export const vivadoCleanRunOutputsActionDefinition: VivadoRunCommandDefinition = {
    actionId: 'cleanRunOutputs',
    title: 'Clean Run Outputs',
    actionName: 'clean run outputs',
    taskActionName: 'Clean Run Outputs',
    runType: VivadoRunType.Synthesis,
    runTypes: [VivadoRunType.Synthesis, VivadoRunType.Implementation],
    runDescription: 'synthesis or implementation',
    defaultRunName: 'synth_1',
    supportsProjectTarget: false,
    supportsRunTarget: true,
    destructive: true,
    confirmation: (project, run) => ({
        message: `Clean generated outputs for Vivado run "${run.name}" in "${project.name}"?`,
        detail: 'This resets the run and deletes only the Vivado-reported run directory after path guards pass.',
        confirmLabel: 'Clean Run Outputs',
    }),
    buildTcl: buildVivadoCleanRunOutputsTcl,
};

export default async function cleanVivadoRunOutputs(
    target: VivadoProject | VivadoRunCommandTarget | undefined,
    options: CleanVivadoRunOutputsOptions = {},
): Promise<boolean> {
    return runVivadoProjectCommand(target, vivadoCleanRunOutputsActionDefinition, options);
}

export function buildVivadoCleanRunOutputsTcl(project: VivadoProject, run: VivadoRun): string {
    const projectPath = quoteTclString(project.xprFile.fsPath);
    const projectRoot = quoteTclString(project.uri.fsPath);
    const runName = quoteTclString(run.name);

    return [
        `open_project ${projectPath}`,
        `set selected_run [get_runs ${runName}]`,
        'if {[llength $selected_run] != 1} {',
        `    error ${quoteTclString(`Expected exactly one Vivado run named ${run.name}`)}`,
        '}',
        '',
        `set project_root [file normalize ${projectRoot}]`,
        'set run_dir_property [get_property DIRECTORY $selected_run]',
        'if {$run_dir_property eq ""} {',
        `    error ${quoteTclString(`Vivado did not report a run directory for ${run.name}`)}`,
        '}',
        'set run_dir [file normalize $run_dir_property]',
        '',
        'if {$run_dir eq $project_root} {',
        `    error ${quoteTclString('Refusing to delete the project root')}`,
        '}',
        '',
        'set project_parts [file split $project_root]',
        'set run_parts [file split $run_dir]',
        'set prefix [lrange $run_parts 0 [expr {[llength $project_parts] - 1}]]',
        '',
        'if {[llength $run_parts] <= [llength $project_parts] || $prefix ne $project_parts} {',
        '    error "Refusing to delete a run directory outside the project root: $run_dir"',
        '}',
        '',
        'reset_runs $selected_run',
        '',
        'if {[file exists $run_dir]} {',
        '    file delete -force -- $run_dir',
        '}',
        '',
        'close_project',
    ].join('\n');
}

export function buildVivadoCleanRunOutputsTaskName(project: VivadoProject, run: VivadoRun): string {
    return buildVivadoRunTaskName(vivadoCleanRunOutputsActionDefinition.taskActionName, project, run);
}

export function resolveCleanRunOutputsTarget(target: VivadoProject | VivadoRunCommandTarget | undefined): ResolvedVivadoRunCommand {
    return resolveVivadoRunTarget(target, vivadoCleanRunOutputsActionDefinition);
}

export { commandId as cleanVivadoRunOutputsCommandId };

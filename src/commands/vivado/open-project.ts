import { spawn, SpawnOptions } from 'child_process';
import fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';
import { VivadoProject } from '../../models/vivado-project';
import { OutputConsole } from '../../output-console';
import { buildVivadoEnvironment } from '../../utils/vivado-run';
import { getVivadoSettings, VivadoSettings } from '../../utils/vivado-settings';
import {
    buildVivadoTclFileUri,
    resolveVivadoTclDirectory,
    VivadoTclScript,
    VivadoTclWriteOptions,
    writeVisibleVivadoTclScript,
} from '../../utils/vivado-tcl';

const commandId = 'vscode-vivado.projects.openInVivado';

export interface VivadoGuiLaunch {
    command: string;
    args: string[];
    options: SpawnOptions;
    commandLine: string;
}

export interface SpawnedVivadoProcess {
    once(event: 'spawn', listener: () => void): this;
    once(event: 'error', listener: (error: Error) => void): this;
    unref(): void;
}

export type VivadoGuiSpawn = (command: string, args: string[], options: SpawnOptions) => SpawnedVivadoProcess;

export interface OpenVivadoProjectDependencies {
    existsSync: (filePath: string) => boolean;
    spawn: VivadoGuiSpawn;
    writeTclScript: (options: VivadoTclWriteOptions) => VivadoTclScript;
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    appendLine: (message: string) => void;
    environment: NodeJS.ProcessEnv;
    shell?: string;
}

export interface OpenVivadoProjectOptions {
    settings?: VivadoSettings;
    platform?: NodeJS.Platform;
    now?: Date;
    tclDirectory?: vscode.Uri;
    dependencies?: Partial<OpenVivadoProjectDependencies>;
}

export default async function openVivadoProject(
    project: VivadoProject | undefined,
    options: OpenVivadoProjectOptions = {},
): Promise<boolean> {
    const platform = options.platform ?? process.platform;
    const settings = options.settings ?? getVivadoSettings({ platform });
    const dependencies = resolveDependencies(options.dependencies);

    try {
        if (!project) {
            throw new Error('Select a Vivado project in the Projects view before running Open in Vivado.');
        }

        const environment = buildVivadoEnvironment(settings, dependencies.environment, platform);
        validateVivadoProject(project, dependencies.existsSync);
        validateVivadoLaunchSettings(settings, platform, environment, dependencies.existsSync);

        const taskName = `Open ${project.name} in Vivado`;
        const tclDirectory = options.tclDirectory ?? resolveVivadoTclDirectory(project.uri, settings);
        const tclFile = buildVivadoTclFileUri(tclDirectory, taskName, options.now);
        const launch = buildVivadoGuiLaunch(project, tclFile, settings, {
            environment,
            platform,
            shell: dependencies.shell,
        });
        const script = dependencies.writeTclScript({
            startPath: project.uri,
            taskName,
            tcl: buildVivadoOpenProjectTcl(project),
            settings,
            rerunCommand: launch.commandLine,
            tclDirectory,
            uri: tclFile,
            now: options.now,
        });

        dependencies.appendLine(`Vivado GUI TCL script: ${script.uri.fsPath}`);
        dependencies.appendLine(`Launch Vivado GUI: ${launch.commandLine}`);

        await launchVivadoGui(launch, dependencies.spawn);
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await dependencies.showErrorMessage(message);
        return false;
    }
}

export function buildVivadoOpenProjectTcl(project: VivadoProject): string {
    return `open_project ${quoteTclString(project.xprFile.fsPath)}`;
}

export function buildVivadoGuiLaunch(
    project: VivadoProject,
    tclFile: vscode.Uri,
    settings: VivadoSettings,
    options: {
        environment?: NodeJS.ProcessEnv;
        platform?: NodeJS.Platform;
        shell?: string;
    } = {},
): VivadoGuiLaunch {
    const platform = options.platform ?? process.platform;
    const environment = options.environment ?? buildVivadoEnvironment(settings, process.env, platform);
    const vivadoCommand = [
        quoteShellArgument(settings.resolvedExecutablePath, platform),
        '-mode',
        'gui',
        '-source',
        quoteShellArgument(tclFile.fsPath, platform),
    ].join(' ');

    if (platform === 'win32') {
        const commandBody = settings.vivadoSettingsScript
            ? `call ${quoteShellArgument(settings.vivadoSettingsScript, platform)} && ${vivadoCommand}`
            : vivadoCommand;

        return {
            command: 'cmd.exe',
            args: ['/d', '/c', commandBody],
            options: buildSpawnOptions(project, environment),
            commandLine: `cmd.exe /d /c ${quoteWindowsCommand(commandBody)}`,
        };
    }

    if (settings.vivadoSettingsScript) {
        const shell = options.shell ?? process.env.SHELL ?? '/bin/sh';
        const commandBody = `. ${quoteShellArgument(settings.vivadoSettingsScript, platform)} && ${vivadoCommand}`;

        return {
            command: shell,
            args: ['-c', commandBody],
            options: buildSpawnOptions(project, environment),
            commandLine: `${quoteShellArgument(shell, platform)} -c ${quoteShellArgument(commandBody, platform)}`,
        };
    }

    return {
        command: settings.resolvedExecutablePath,
        args: ['-mode', 'gui', '-source', tclFile.fsPath],
        options: buildSpawnOptions(project, environment),
        commandLine: vivadoCommand,
    };
}

function resolveDependencies(dependencies: Partial<OpenVivadoProjectDependencies> = {}): OpenVivadoProjectDependencies {
    return {
        existsSync: fs.existsSync,
        spawn: (command, args, options) => spawn(command, args, options) as SpawnedVivadoProcess,
        writeTclScript: writeVisibleVivadoTclScript,
        showErrorMessage: message => vscode.window.showErrorMessage(message),
        appendLine: message => OutputConsole.instance.appendLine(message),
        environment: process.env,
        ...dependencies,
    };
}

function validateVivadoProject(project: VivadoProject, existsSync: (filePath: string) => boolean): void {
    if (path.extname(project.xprFile.fsPath).toLowerCase() !== '.xpr') {
        throw new Error(`Vivado project path is not a .xpr file: ${project.xprFile.fsPath}`);
    }

    if (!existsSync(project.xprFile.fsPath)) {
        throw new Error(`Vivado project file not found: ${project.xprFile.fsPath}`);
    }
}

function validateVivadoLaunchSettings(
    settings: VivadoSettings,
    platform: NodeJS.Platform,
    environment: NodeJS.ProcessEnv,
    existsSync: (filePath: string) => boolean,
): void {
    if (settings.vivadoSettingsScript && !existsSync(settings.vivadoSettingsScript)) {
        throw new Error(`Vivado settings script not found: ${settings.vivadoSettingsScript}`);
    }

    if (looksLikePath(settings.resolvedExecutablePath, platform)) {
        if (!existsSync(settings.resolvedExecutablePath)) {
            throw new Error(
                `Vivado executable not found: ${settings.resolvedExecutablePath}. ` +
                'Set vscode-vivado.vivadoPath or vscode-vivado.vivadoExecutablePath.',
            );
        }
        return;
    }

    if (!commandExistsOnPath(settings.resolvedExecutablePath, environment, platform, existsSync)) {
        throw new Error(
            `Vivado executable not found on PATH: ${settings.resolvedExecutablePath}. ` +
            'Set vscode-vivado.vivadoPath or vscode-vivado.vivadoExecutablePath.',
        );
    }
}

function buildSpawnOptions(project: VivadoProject, environment: NodeJS.ProcessEnv): SpawnOptions {
    return {
        cwd: project.uri.fsPath,
        detached: true,
        env: environment,
        stdio: 'ignore',
        windowsHide: false,
    };
}

function launchVivadoGui(launch: VivadoGuiLaunch, spawnProcess: VivadoGuiSpawn): Promise<void> {
    return new Promise((resolve, reject) => {
        let child: SpawnedVivadoProcess;
        let settled = false;

        try {
            child = spawnProcess(launch.command, launch.args, launch.options);
        } catch (error) {
            reject(new Error(`Failed to launch Vivado: ${error instanceof Error ? error.message : String(error)}`));
            return;
        }

        child.once('error', error => {
            if (!settled) {
                settled = true;
                reject(new Error(`Failed to launch Vivado: ${error.message}`));
            }
        });

        child.once('spawn', () => {
            if (!settled) {
                settled = true;
                child.unref();
                resolve();
            }
        });
    });
}

function commandExistsOnPath(
    command: string,
    environment: NodeJS.ProcessEnv,
    platform: NodeJS.Platform,
    existsSync: (filePath: string) => boolean,
): boolean {
    const pathKey = Object.keys(environment).find(key => key.toLowerCase() === 'path') ?? 'PATH';
    const pathValue = environment[pathKey] ?? '';
    const pathDelimiter = platform === 'win32' ? ';' : ':';
    const pathApi = getPathApi(platform);
    const extensions = getExecutableExtensions(command, environment, platform);

    return pathValue
        .split(pathDelimiter)
        .filter(directory => directory.length > 0)
        .some(directory => extensions.some(extension => existsSync(pathApi.join(directory, `${command}${extension}`))));
}

function getExecutableExtensions(command: string, environment: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
    if (platform !== 'win32' || path.win32.extname(command)) {
        return [''];
    }

    const pathextKey = Object.keys(environment).find(key => key.toLowerCase() === 'pathext');
    const pathext = pathextKey ? environment[pathextKey] ?? '' : '.COM;.EXE;.BAT;.CMD';
    return [
        ...pathext.split(';').filter(extension => extension.length > 0),
        '',
    ];
}

function quoteTclString(value: string): string {
    return `"${value
        .replace(/\\/g, '\\\\')
        .replace(/\$/g, '\\$')
        .replace(/"/g, '\\"')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')}"`;
}

function quoteShellArgument(value: string, platform: NodeJS.Platform): string {
    if (platform === 'win32') {
        return `"${value.replace(/"/g, '""')}"`;
    }

    return `'${value.replace(/'/g, "'\\''")}'`;
}

function quoteWindowsCommand(value: string): string {
    return `"${value}"`;
}

function looksLikePath(value: string, platform: NodeJS.Platform): boolean {
    return value.includes('/') || value.includes('\\') || getPathApi(platform).isAbsolute(value);
}

function getPathApi(platform: NodeJS.Platform): path.PlatformPath {
    return platform === 'win32' ? path.win32 : path.posix;
}

export { commandId as openVivadoProjectCommandId };

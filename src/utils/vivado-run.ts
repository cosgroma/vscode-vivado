import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { vivadoTaskSource } from '../constants';
import { getVivadoSettings, VivadoSettings } from './vivado-settings';

export interface VivadoRunOptions {
    settings?: VivadoSettings;
    presentationOptions?: vscode.TaskPresentationOptions;
    problemMatchers?: string[];
    preserveTclFile?: boolean;
    tclDirectory?: vscode.Uri;
    platform?: NodeJS.Platform;
}

export async function vivadoRun(
    startPath: vscode.Uri,
    tcl: string,
    taskName: string,
    options: VivadoRunOptions = {},
): Promise<number | undefined> {
    const tclFilePath = writeTclFile(tcl, options.tclDirectory);

    return vivadoRunScript(
        startPath,
        vscode.Uri.file(tclFilePath),
        taskName,
        {
            ...options,
            preserveTclFile: options.preserveTclFile ?? false,
        },
        options.preserveTclFile ? undefined : tclFilePath,
    );
}

export async function vivadoRunScript(
    startPath: vscode.Uri,
    tclFile: vscode.Uri,
    taskName: string,
    options: VivadoRunOptions = {},
    cleanupTclFilePath?: string,
): Promise<number | undefined> {
    const platform = options.platform ?? process.platform;
    const settings = options.settings ?? getVivadoSettings({ platform });
    const task = buildVivadoTask(startPath, tclFile, taskName, settings, options, platform);

    let disposable: vscode.Disposable | undefined;
    const exitCode = new Promise<number | undefined>((resolve) => {
        disposable = vscode.tasks.onDidEndTaskProcess(e => {
            if (e.execution.task === task) {
                disposable?.dispose();
                cleanupTclFile(cleanupTclFilePath);
                resolve(e.exitCode);
            }
        });
    });

    try {
        await vscode.tasks.executeTask(task);
    } catch (error) {
        disposable?.dispose();
        cleanupTclFile(cleanupTclFilePath);
        throw error;
    }

    return exitCode;
}

export function buildVivadoCommandLine(settings: VivadoSettings, tclFilePath: string, platform: NodeJS.Platform = process.platform): string {
    const vivadoCommand = [
        quoteShellArgument(settings.resolvedExecutablePath, platform),
        '-mode',
        'batch',
        '-source',
        quoteShellArgument(tclFilePath, platform),
    ].join(' ');

    if (platform === 'win32') {
        const command = settings.vivadoSettingsScript
            ? `call ${quoteShellArgument(settings.vivadoSettingsScript, platform)} && ${vivadoCommand}`
            : vivadoCommand;

        return `cmd.exe /d /c ${quoteWindowsCommand(command)}`;
    }

    if (!settings.vivadoSettingsScript) {
        return vivadoCommand;
    }

    const settingsCommand = `. ${quoteShellArgument(settings.vivadoSettingsScript, platform)}`;

    return `${settingsCommand} && ${vivadoCommand}`;
}

export function buildVivadoEnvironment(
    settings: VivadoSettings,
    baseEnvironment: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): { [key: string]: string } {
    const env: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(baseEnvironment)) {
        if (value !== undefined) {
            env[key] = value;
        }
    }

    if (settings.pathEntries.length === 0) {
        return env;
    }

    const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
    const delimiter = platform === 'win32' ? ';' : ':';
    const currentPath = env[pathKey];
    env[pathKey] = [
        ...settings.pathEntries,
        ...(currentPath ? [currentPath] : []),
    ].join(delimiter);

    return env;
}

function buildVivadoTask(
    startPath: vscode.Uri,
    tclFile: vscode.Uri,
    taskName: string,
    settings: VivadoSettings,
    options: VivadoRunOptions,
    platform: NodeJS.Platform,
): vscode.Task {
    const shellExecution = new vscode.ShellExecution(
        buildVivadoCommandLine(settings, tclFile.fsPath, platform),
        {
            cwd: startPath.fsPath,
            env: buildVivadoEnvironment(settings, process.env, platform),
        },
    );

    const task = new vscode.Task(
        { type: 'shell' },
        vscode.TaskScope.Workspace,
        taskName,
        vivadoTaskSource,
        shellExecution,
        options.problemMatchers,
    );

    if (options.presentationOptions !== undefined) {
        task.presentationOptions = options.presentationOptions;
    }

    return task;
}

function writeTclFile(tcl: string, directory?: vscode.Uri): string {
    const targetDirectory = directory?.fsPath ?? os.tmpdir();
    fs.mkdirSync(targetDirectory, { recursive: true });

    const fileName = `vscode-vivado-tcl-${Date.now()}.tcl`;
    const tclFilePath = path.join(targetDirectory, fileName);
    fs.writeFileSync(tclFilePath, tcl);

    return tclFilePath;
}

function cleanupTclFile(tclFilePath: string | undefined): void {
    if (!tclFilePath) {
        return;
    }

    fs.unlink(tclFilePath, err => {
        if (err) {
            console.error(`Error deleting file ${tclFilePath}:`, err);
        }
    });
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

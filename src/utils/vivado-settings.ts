import path from 'path';
import * as vscode from 'vscode';

export const vivadoConfigSection = 'vscode-vivado';

const defaultVivadoPath = 'C:\\Xilinx\\Vivado\\2023.2';
const defaultProjectSearchGlobs = ['**/*.xpr'];
const defaultReportsDirectory = 'reports';
const defaultGeneratedTclDirectory = '.vscode-vivado/tcl';

export interface VivadoSettings {
    vivadoPath: string;
    vivadoExecutablePath: string;
    vivadoSettingsScript: string;
    projectSearchGlobs: string[];
    reportsDirectory: string;
    generatedTclDirectory: string;
    preserveRunLogs: boolean;
    resolvedExecutablePath: string;
    pathEntries: string[];
}

export interface VivadoSettingsOptions {
    configuration?: Pick<vscode.WorkspaceConfiguration, 'get'>;
    platform?: NodeJS.Platform;
}

type PathApi = typeof path.posix;

export function getVivadoSettings(options: VivadoSettingsOptions = {}): VivadoSettings {
    const configuration = options.configuration ?? vscode.workspace.getConfiguration(vivadoConfigSection);
    const platform = options.platform ?? process.platform;

    const vivadoPath = normalizeStringSetting(configuration.get<string>('vivadoPath', defaultVivadoPath));
    const vivadoExecutablePath = normalizeStringSetting(configuration.get<string>('vivadoExecutablePath', ''));
    const vivadoSettingsScript = normalizeStringSetting(configuration.get<string>('vivadoSettingsScript', ''));
    const reportsDirectory = normalizeStringSetting(configuration.get<string>('reportsDirectory', defaultReportsDirectory)) || defaultReportsDirectory;
    const generatedTclDirectory = normalizeStringSetting(configuration.get<string>('generatedTclDirectory', defaultGeneratedTclDirectory)) || defaultGeneratedTclDirectory;
    const projectSearchGlobs = normalizeStringArray(
        configuration.get<string[]>('projectSearchGlobs', defaultProjectSearchGlobs),
        defaultProjectSearchGlobs
    );
    const preserveRunLogs = normalizeBooleanSetting(configuration.get<unknown>('preserveRunLogs', true), true);

    return {
        vivadoPath,
        vivadoExecutablePath,
        vivadoSettingsScript,
        projectSearchGlobs,
        reportsDirectory,
        generatedTclDirectory,
        preserveRunLogs,
        resolvedExecutablePath: resolveVivadoExecutablePath(vivadoExecutablePath, vivadoPath, platform),
        pathEntries: resolveVivadoPathEntries(vivadoExecutablePath, vivadoPath, platform),
    };
}

export function resolveVivadoExecutablePath(
    vivadoExecutablePath: string | undefined,
    vivadoPath: string | undefined,
    platform: NodeJS.Platform = process.platform,
): string {
    const explicitExecutable = normalizeStringSetting(vivadoExecutablePath);
    if (explicitExecutable) {
        return explicitExecutable;
    }

    const binPath = resolveVivadoBinPath(vivadoPath, platform);
    if (binPath) {
        return getPathApi(platform).join(binPath, getVivadoExecutableName(platform));
    }

    return getVivadoExecutableName(platform);
}

export function resolveVivadoBinPath(vivadoPath: string | undefined, platform: NodeJS.Platform = process.platform): string | undefined {
    const normalizedVivadoPath = normalizeStringSetting(vivadoPath).replace(/[\\/]+$/, '');
    if (!normalizedVivadoPath) {
        return undefined;
    }

    const pathApi = getPathApi(platform);
    if (pathApi.basename(normalizedVivadoPath).toLowerCase() === 'bin') {
        return normalizedVivadoPath;
    }

    return pathApi.join(normalizedVivadoPath, 'bin');
}

export function getVivadoExecutableName(platform: NodeJS.Platform = process.platform): string {
    return platform === 'win32' ? 'vivado.bat' : 'vivado';
}

function resolveVivadoPathEntries(
    vivadoExecutablePath: string | undefined,
    vivadoPath: string | undefined,
    platform: NodeJS.Platform,
): string[] {
    const pathApi = getPathApi(platform);
    const entries: string[] = [];
    const explicitExecutable = normalizeStringSetting(vivadoExecutablePath);

    if (explicitExecutable && looksLikePath(explicitExecutable, platform)) {
        const executableDir = pathApi.dirname(explicitExecutable);
        if (executableDir && executableDir !== '.') {
            entries.push(executableDir);
        }
    }

    const binPath = resolveVivadoBinPath(vivadoPath, platform);
    if (binPath) {
        entries.push(binPath);
    }

    return [...new Set(entries)];
}

function looksLikePath(value: string, platform: NodeJS.Platform): boolean {
    return value.includes('/') || value.includes('\\') || getPathApi(platform).isAbsolute(value);
}

function getPathApi(platform: NodeJS.Platform): PathApi {
    return platform === 'win32' ? path.win32 : path.posix;
}

function normalizeStringSetting(value: string | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeBooleanSetting(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
    if (!Array.isArray(value)) {
        return [...fallback];
    }

    const normalized = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0);

    return normalized.length > 0 ? normalized : [...fallback];
}

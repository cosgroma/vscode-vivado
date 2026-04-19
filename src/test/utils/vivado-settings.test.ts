/**
 * Tests for Vivado configuration resolution.
 * Covers #4 - Add Vivado path and execution settings.
 */
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    getVivadoExecutableName,
    getVivadoSettings,
    resolveVivadoBinPath,
    resolveVivadoExecutablePath,
    vivadoConfigSection,
} from '../../utils/vivado-settings';

function fakeConfiguration(values: Record<string, unknown>): Pick<vscode.WorkspaceConfiguration, 'get'> {
    return {
        get: <T>(key: string, defaultValue?: T): T => {
            if (Object.prototype.hasOwnProperty.call(values, key)) {
                return values[key] as T;
            }
            return defaultValue as T;
        },
    };
}

suite('Vivado settings contribution', () => {
    test('package.json contributes the Vivado configuration section and keys', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require('../../../package.json');
        const properties = pkg.contributes.configuration.properties;

        assert.strictEqual(pkg.contributes.configuration.title, 'VS Code Vivado');
        assert.ok(properties[`${vivadoConfigSection}.vivadoPath`]);
        assert.ok(properties[`${vivadoConfigSection}.vivadoExecutablePath`]);
        assert.ok(properties[`${vivadoConfigSection}.vivadoSettingsScript`]);
        assert.ok(properties[`${vivadoConfigSection}.projectSearchGlobs`]);
        assert.ok(properties[`${vivadoConfigSection}.reportsDirectory`]);
        assert.ok(properties[`${vivadoConfigSection}.preserveRunLogs`]);
    });
});

suite('Vivado settings resolution', () => {
    test('uses Windows-first defaults from the package configuration contract', () => {
        const settings = getVivadoSettings({
            configuration: fakeConfiguration({}),
            platform: 'win32',
        });

        assert.strictEqual(settings.vivadoPath, 'C:\\Xilinx\\Vivado\\2023.2');
        assert.strictEqual(
            settings.resolvedExecutablePath,
            'C:\\Xilinx\\Vivado\\2023.2\\bin\\vivado.bat'
        );
        assert.deepStrictEqual(settings.projectSearchGlobs, ['**/*.xpr']);
        assert.strictEqual(settings.reportsDirectory, 'reports');
        assert.strictEqual(settings.preserveRunLogs, true);
    });

    test('uses explicit executable path before deriving from vivadoPath', () => {
        const executable = 'D:\\Tools\\Vivado\\2024.2\\bin\\vivado.bat';
        const settings = getVivadoSettings({
            configuration: fakeConfiguration({
                vivadoPath: 'C:\\Xilinx\\Vivado\\2023.2',
                vivadoExecutablePath: ` ${executable} `,
            }),
            platform: 'win32',
        });

        assert.strictEqual(settings.resolvedExecutablePath, executable);
        assert.deepStrictEqual(settings.pathEntries, [
            'D:\\Tools\\Vivado\\2024.2\\bin',
            'C:\\Xilinx\\Vivado\\2023.2\\bin',
        ]);
    });

    test('derives a portable executable from an install path', () => {
        assert.strictEqual(
            resolveVivadoExecutablePath('', '/opt/Xilinx/Vivado/2024.2', 'linux'),
            '/opt/Xilinx/Vivado/2024.2/bin/vivado'
        );
        assert.strictEqual(getVivadoExecutableName('darwin'), 'vivado');
    });

    test('does not append bin twice when vivadoPath already points at bin', () => {
        assert.strictEqual(
            resolveVivadoBinPath('C:\\Xilinx\\Vivado\\2023.2\\bin\\', 'win32'),
            'C:\\Xilinx\\Vivado\\2023.2\\bin'
        );
    });

    test('trims string settings and filters project discovery globs', () => {
        const settings = getVivadoSettings({
            configuration: fakeConfiguration({
                vivadoPath: ' /tools/vivado ',
                vivadoSettingsScript: ' /tools/vivado/settings64.sh ',
                projectSearchGlobs: [' **/*.xpr ', '', '   ', '**/*.bd'],
                reportsDirectory: ' vivado-reports ',
                preserveRunLogs: false,
            }),
            platform: 'linux',
        });

        assert.strictEqual(settings.vivadoPath, '/tools/vivado');
        assert.strictEqual(settings.vivadoSettingsScript, '/tools/vivado/settings64.sh');
        assert.deepStrictEqual(settings.projectSearchGlobs, ['**/*.xpr', '**/*.bd']);
        assert.strictEqual(settings.reportsDirectory, 'vivado-reports');
        assert.strictEqual(settings.preserveRunLogs, false);
    });

    test('falls back to default discovery glob when configured globs are empty', () => {
        const settings = getVivadoSettings({
            configuration: fakeConfiguration({
                projectSearchGlobs: ['', '   '],
            }),
            platform: 'linux',
        });

        assert.deepStrictEqual(settings.projectSearchGlobs, ['**/*.xpr']);
    });

    test('falls back to preserving run logs when the setting is not boolean', () => {
        const settings = getVivadoSettings({
            configuration: fakeConfiguration({
                preserveRunLogs: 'false',
            }),
            platform: 'linux',
        });

        assert.strictEqual(settings.preserveRunLogs, true);
    });

    test('keeps command-name executable overrides on PATH', () => {
        const settings = getVivadoSettings({
            configuration: fakeConfiguration({
                vivadoPath: '',
                vivadoExecutablePath: 'vivado',
            }),
            platform: 'linux',
        });

        assert.strictEqual(settings.resolvedExecutablePath, 'vivado');
        assert.deepStrictEqual(settings.pathEntries, []);
        assert.strictEqual(path.posix.basename(settings.resolvedExecutablePath), 'vivado');
    });
});

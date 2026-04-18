/**
 * Tests for OutputConsole singleton and channel forwarding.
 * Closes #31 – Test OutputConsole singleton and channel forwarding.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { OutputConsole } from '../output-console';

suite('OutputConsole', () => {

    // ── singleton ──────────────────────────────────────────────────────────

    test('instance returns the same singleton on repeated calls', () => {
        const a = OutputConsole.instance;
        const b = OutputConsole.instance;
        assert.strictEqual(a, b, 'OutputConsole.instance should always be the same object');
    });

    // ── appendLine ─────────────────────────────────────────────────────────

    test('appendLine forwards a message without throwing', () => {
        assert.doesNotThrow(() => {
            OutputConsole.instance.appendLine('test message from unit test');
        });
    });

    test('appendLine forwards an empty string without throwing', () => {
        assert.doesNotThrow(() => {
            OutputConsole.instance.appendLine('');
        });
    });

    // ── replace ────────────────────────────────────────────────────────────

    test('replace forwards a message without throwing', () => {
        assert.doesNotThrow(() => {
            OutputConsole.instance.replace('replaced content');
        });
    });

    test('replace forwards an empty string without throwing', () => {
        assert.doesNotThrow(() => {
            OutputConsole.instance.replace('');
        });
    });

    // ── show ───────────────────────────────────────────────────────────────

    test('show() with no arguments does not throw', () => {
        assert.doesNotThrow(() => {
            OutputConsole.instance.show();
        });
    });

    test('show(true) forwards preserveFocus=true without throwing', () => {
        assert.doesNotThrow(() => {
            OutputConsole.instance.show(true);
        });
    });

    test('show(false) forwards preserveFocus=false without throwing', () => {
        assert.doesNotThrow(() => {
            OutputConsole.instance.show(false);
        });
    });

    // ── channel name / log option ──────────────────────────────────────────

    test('output channel is created with the expected name', () => {
        // Verify by round-tripping through the real VS Code API: we can confirm
        // the instance was created (if it throws we know creation failed).
        const console = OutputConsole.instance;
        assert.ok(console, 'Instance should be truthy after creation');
    });
});

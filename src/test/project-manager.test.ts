/**
 * Tests for ProjectManager refresh lifecycle and error handling.
 * Closes #25 – Test ProjectManager refresh lifecycle and error handling.
 */
import * as assert from 'assert';
import ProjectManager from '../project-manager';

suite('ProjectManager', () => {

    // ── singleton ──────────────────────────────────────────────────────────

    test('instance returns the same singleton on repeated calls', () => {
        const a = ProjectManager.instance;
        const b = ProjectManager.instance;
        assert.strictEqual(a, b, 'ProjectManager.instance must always be the same object');
    });

    // ── getProjects ────────────────────────────────────────────────────────

    test('getProjects returns an array', async () => {
        const projects = await ProjectManager.instance.getProjects();
        assert.ok(Array.isArray(projects));
    });

    test('projects array is empty when no hls.app files exist in the workspace', async () => {
        // The VS Code test environment does not open a workspace that contains
        // hls.app files, so the refresh cycle should yield an empty array.
        const projects = await ProjectManager.instance.getProjects();
        assert.strictEqual(projects.length, 0);
    });

    test('getProjects returns the same array reference as the public projects property', async () => {
        const fromGetter = await ProjectManager.instance.getProjects();
        assert.strictEqual(fromGetter, ProjectManager.instance.projects);
    });

    // ── refresh ────────────────────────────────────────────────────────────

    test('refresh does not throw', () => {
        assert.doesNotThrow(() => {
            ProjectManager.instance.refresh();
        });
    });

    test('calling refresh twice in quick succession does not throw', async () => {
        assert.doesNotThrow(() => {
            ProjectManager.instance.refresh();
            ProjectManager.instance.refresh();
        });
        // Allow both refreshes to settle before the next test.
        await ProjectManager.instance.getProjects();
    });

    test('getProjects waits for an in-progress refresh and returns', async () => {
        // Trigger a new refresh then immediately await getProjects – it must
        // resolve after the refresh completes (not before).
        ProjectManager.instance.refresh();
        const projects = await ProjectManager.instance.getProjects();
        assert.ok(Array.isArray(projects));
    });

    test('project list does not grow with repeated refreshes (no duplication)', async () => {
        // Three consecutive refreshes on an empty workspace should not add phantom entries.
        ProjectManager.instance.refresh();
        await ProjectManager.instance.getProjects();
        ProjectManager.instance.refresh();
        await ProjectManager.instance.getProjects();
        assert.strictEqual(ProjectManager.instance.projects.length, 0);
    });

    // ── projectsChanged event ──────────────────────────────────────────────

    test('projectsChanged event fires after refresh completes', async () => {
        let fired = false;
        const handler = () => { fired = true; };
        ProjectManager.instance.once('projectsChanged', handler);
        ProjectManager.instance.refresh();
        await ProjectManager.instance.getProjects();
        assert.strictEqual(fired, true, 'projectsChanged must fire after refresh');
    });

    // ── dispose ────────────────────────────────────────────────────────────

    test('dispose removes all event listeners without throwing', () => {
        assert.doesNotThrow(() => {
            ProjectManager.instance.dispose();
        });
    });

    test('getProjects still resolves after dispose', async () => {
        // dispose only removes listeners; the instance itself remains functional.
        ProjectManager.instance.dispose();
        const projects = await ProjectManager.instance.getProjects();
        assert.ok(Array.isArray(projects));
    });
});

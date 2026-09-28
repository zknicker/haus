import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { seedAgentWorkspace } from './starter-kit.ts';

describe('ordinary Agent workspace seed', () => {
    let workspaceDir = '';

    beforeEach(async () => {
        workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haus-starter-kit-'));
    });

    afterEach(async () => {
        await fs.rm(workspaceDir, { force: true, recursive: true });
    });

    it('seeds a minimal MEMORY.md and an empty notes/ into a fresh workspace', async () => {
        const seeded = await seedAgentWorkspace({
            agentName: 'scout',
            bio: 'Operator — ships scoped, verified changes end to end',
            workspaceDir,
        });

        expect(seeded).toBe(true);
        const memory = await fs.readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf8');
        expect(memory).toMatch(/^# scout\n/u);
        expect(memory).toContain('Operator — ships scoped, verified changes end to end');
        expect(memory).toContain('## Key Knowledge\n\n- No notes yet.');
        expect(memory).toContain('## Active Context\n\n- First startup.');
        expect(memory).not.toContain('notes/');
        expect((await fs.readdir(workspaceDir)).sort()).toEqual(['MEMORY.md', 'notes']);
        expect(await fs.readdir(path.join(workspaceDir, 'notes'))).toEqual([]);
    });

    // Raft parity (`buildInitialMemoryMd`, Computer 1.0.16): the seed is inert.
    // It states the absence of a role instead of instructing a first turn.
    it('falls back to the inert no-role line when the agent has no bio', async () => {
        await seedAgentWorkspace({ agentName: 'blank', workspaceDir });

        const memory = await fs.readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf8');
        expect(memory).toContain('## Role\n\nNo role defined yet.');
        expect(memory).not.toContain('introduce yourself');
    });

    it('renders the creator’s standing brief as a memory section', async () => {
        await seedAgentWorkspace({
            agentName: 'Orbit',
            bio: 'Watches competitor launches.',
            brief: 'Own competitor intel. Post a digest in #product every Friday.',
            briefAuthorHandle: 'cove',
            workspaceDir,
        });

        const memory = await fs.readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf8');
        expect(memory).toContain('## Standing brief from @cove');
        expect(memory).toContain('Own competitor intel. Post a digest in #product every Friday.');
        // The brief is what it owns; this line is what it does about it first.
        expect(memory).toContain(
            'On your first turn, say hello in #all in your own voice: who you are, what you own, and what your first output will be and when.'
        );
        expect(memory.indexOf('## Standing brief from @cove')).toBeLessThan(
            memory.indexOf('## Key Knowledge')
        );
    });

    it('leaves out the brief section when there is no brief', async () => {
        await seedAgentWorkspace({
            agentName: 'Orbit',
            briefAuthorHandle: 'cove',
            workspaceDir,
        });

        const memory = await fs.readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf8');
        expect(memory).not.toContain('Standing brief');
        expect(memory).toContain('## Role\n\nNo role defined yet.\n\n## Key Knowledge');
    });

    it('never touches a workspace that already has a MEMORY.md', async () => {
        await fs.writeFile(path.join(workspaceDir, 'MEMORY.md'), '# mine\n');

        const seeded = await seedAgentWorkspace({ agentName: 'scout', workspaceDir });

        expect(seeded).toBe(false);
        await expect(fs.readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf8')).resolves.toBe(
            '# mine\n'
        );
        // A reprovision re-sends the brief; the owned workspace still wins.
        await seedAgentWorkspace({
            agentName: 'scout',
            brief: 'Own the delivery lane.',
            briefAuthorHandle: 'cove',
            workspaceDir,
        });
        await expect(fs.readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf8')).resolves.toBe(
            '# mine\n'
        );
        await expect(fs.stat(path.join(workspaceDir, 'notes'))).rejects.toThrow();
    });
});

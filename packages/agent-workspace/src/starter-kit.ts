/**
 * Ordinary Agent workspace seed. MEMORY.md starts in the prompt's shape: hot
 * memory (role, standing preferences, Active Context) then an empty Key
 * Knowledge index, beside an empty `notes/` for the deeper knowledge it
 * indexes (Raft's `initializeAgentWorkspace`); durable guidance remains
 * available through the shared Manual rather than being copied into every
 * Agent workspace.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export interface SeedAgentWorkspaceInput {
    agentName: string;
    bio?: string | null;
    /** The standing instruction the Agent that made this one wrote for it. */
    brief?: string | null;
    /** Whose brief it is, so the new Agent knows who to go back to. */
    briefAuthorHandle?: string | null;
    workspaceDir: string;
}

/**
 * Seed a fresh agent workspace. No-op (returns false) when the workspace
 * already has a MEMORY.md — an owned workspace is never overwritten.
 */
export async function seedAgentWorkspace(input: SeedAgentWorkspaceInput): Promise<boolean> {
    const memoryPath = path.join(input.workspaceDir, 'MEMORY.md');
    if (await pathExists(memoryPath)) {
        return false;
    }

    await fs.mkdir(path.join(input.workspaceDir, 'notes'), { recursive: true });
    await fs.writeFile(memoryPath, renderStarterMemory(input));
    return true;
}

function renderStarterMemory(input: SeedAgentWorkspaceInput): string {
    const role = input.bio?.trim() || 'No role defined yet.';

    return `# ${input.agentName}

## Role

${role}
${renderBriefSection(input)}
## Standing Preferences

- None recorded yet.

## Active Context

- First startup.

## Key Knowledge

- No notes yet.
`;
}

/**
 * The brief its creator wrote, as a durable memory fact rather than a message.
 * It is seeded once, with the rest of this file, so the Agent owns it from
 * there: later edits are the Agent's own, and an owned workspace is never
 * overwritten.
 */
function renderBriefSection(input: SeedAgentWorkspaceInput): string {
    const brief = input.brief?.trim();
    const author = input.briefAuthorHandle?.trim();
    if (!(brief && author)) {
        return '';
    }
    const firstTurn =
        'On your first turn, say hello in #all in your own voice: who you are, what you own, and what your first output will be and when.';
    return `\n## Standing brief from @${author}\n\n${brief}\n\n${firstTurn}\n`;
}

async function pathExists(filePath: string): Promise<boolean> {
    return await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
}

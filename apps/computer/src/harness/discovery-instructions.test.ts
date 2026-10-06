import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

// Raft v1.21.2 clauses: a missing documented command means an old CLI, not an
// answer; and a paged directory listing supports claims only about pages read.
test('teaches CLI-version suspicion and paged server listings', () => {
    const prompt = renderAgentInstructions({
        agentId: 'agt_prompt_test',
        agentName: 'Cove',
        homeTimezone: 'UTC',
        hostname: 'computer.test',
        initialRole: null,
        os: 'macOS',
        runtimeVersion: 'test',
        webAccess: null,
        workspacePath: '/workbench',
    });

    for (const clause of [
        '**If something the Manual describes is missing on your CLI, suspect the CLI first.**',
        'a Computer does not upgrade itself. Report that the machine needs upgrading.',
        'every listing is paged: when more rows remain, it prints a `Next:` command',
        'So one page is one page; a claim about every channel needs the pages you actually read',
        'If `haus server info --channels` shows a channel as private',
    ]) {
        expect(prompt).toContain(clause);
    }
});

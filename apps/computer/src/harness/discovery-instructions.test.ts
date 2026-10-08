import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

// Raft v1.21.2 clauses: a missing documented command means an old CLI, not an
// answer; and a paged directory listing supports claims only about pages read.
// Haus has no private channels, so Raft's private-channel clauses stay out.
test('teaches CLI-version suspicion and paged server listings', () => {
    const prompt = renderAgentInstructions({
        agentId: 'agt_prompt_test',
        agentName: 'Cove',
        homeTimezone: 'UTC',
        hostname: 'computer.test',
        initialRole: null,
        os: 'macOS',
        runtimeVersion: 'test',
        workspacePath: '/workbench',
    });

    for (const clause of [
        '**If something the Manual describes is missing on your CLI, suspect the CLI first.**',
        'a Computer does not upgrade itself. Report that the machine needs upgrading.',
        'every listing is paged: when more rows remain, it prints a `Next:` command',
        'So one page is one page; a claim about every channel needs the pages you actually read',
        'In `haus channel members`, human role labels such as owner/admin show server-level authority',
    ]) {
        expect(prompt).toContain(clause);
    }
    expect(prompt).not.toMatch(/private channel/i);
});

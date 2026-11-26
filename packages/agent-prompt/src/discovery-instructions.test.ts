import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

// Raft v1.21.2 clauses: a missing documented command means an old CLI, not an
// answer; and a paged directory listing supports claims only about pages read.
// Haus has no private channels, so Raft's private-channel clauses stay out.
test('teaches CLI-version suspicion and paged server listings', () => {
    const prompt = renderAgentInstructions({
        agentId: 'agt_prompt_test',
        agentName: 'Wren',
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
        '`haus server info`, `haus channel info`, `haus channel members`.',
    ]) {
        expect(prompt).toContain(clause);
    }
    // Only people create Projects (specs/projects.md), so the prompt names no create.
    expect(prompt).not.toContain('haus channel create');
    expect(prompt).not.toMatch(/private channel/i);
});

// ADR 0055 decision 7: an Agent hears its home Project and what reaches it elsewhere.
// Channel membership and mutes are deleted, so no verb for them survives.
test('teaches hearing by home Project, with unfollow as the only narrowing', () => {
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

    expect(prompt).toContain(
        'You belong to one Project, which `haus server info --channels --home` names. You hear everything in its channel, but no Task unless it @mentions you or you follow it. Elsewhere you hear what @mentions you, what is assigned to you, and the Tasks and inline replies you follow; DMs always reach you. You can read and post in every Project. `haus task unfollow --target task:<shortId>` stops a Task you follow, and outside your Project `haus message unfollow` stops a reply chain.'
    );
    expect(prompt).toContain(
        '3. **Conversation attention**: `haus task unfollow`, `haus message follow`, `haus message unfollow`.'
    );
    expect(prompt).not.toMatch(/haus channel (join|leave|mute|unmute|add)|joined=false|pierce/u);
});

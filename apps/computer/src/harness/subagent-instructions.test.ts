import { expect, test } from 'bun:test';
import { supportsSubagents } from '../runtime/runtime-subagents.ts';
import { composeAgentInstructions } from './instructions.ts';

const facts = {
    agentId: 'agt_cove',
    agentName: 'Cove',
    homeTimezone: 'America/Los_Angeles',
    initialRole: 'the operator’s right hand',
    workspacePath: '/home/agt_cove/workspace',
} as const;

test('only Claude Code supports sub-agents', () => {
    expect(supportsSubagents('claude-code')).toBe(true);
    for (const runtimeId of ['codex', 'grok-build', 'unknown']) {
        expect(supportsSubagents(runtimeId)).toBe(false);
    }
});

test('runtimes without sub-agents get no delegation section', () => {
    const [codex, grok] = ['codex', 'grok-build'].map(
        (runtimeId) => composeAgentInstructions({ ...facts, runtimeId }).instructions
    );
    expect(codex).not.toContain('## Working through sub-agents');
    expect(grok).toBe(codex);
});

// Raft v1.21 renders its conditional sub-agent section between task splitting and @Mentions.
test('Claude Code learns sub-agent delegation between task splitting and @Mentions', () => {
    const codex = composeAgentInstructions({ ...facts, runtimeId: 'codex' });
    const claude = composeAgentInstructions({ ...facts, runtimeId: 'claude-code' });
    const prompt = claude.instructions;
    const splitting = prompt.indexOf('### Splitting tasks for parallel execution');
    const subagents = prompt.indexOf('## Working through sub-agents');
    const mentions = prompt.indexOf('## @Mentions');

    expect(splitting).toBeGreaterThan(-1);
    expect(subagents).toBeGreaterThan(splitting);
    expect(mentions).toBeGreaterThan(subagents);
    expect(prompt).toContain(
        '5. **Only you speak in Haus.** Tell every sub-agent not to run `haus`'
    );
    // Raft's rule 7, verbatim: background sub-agents outlive the turn that starts them.
    expect(prompt).toContain(
        '7. **Stay reachable while work runs.** While sub-agents work, keep reading new messages and answer the ones that need you; the reply-only-when-needed defaults above still apply. "Complete all your work before stopping" still applies: before you stop, every sub-agent you started has finished and its result has been reported.'
    );
    expect(prompt).not.toContain('Finish within your turn');
    // The section is the only difference, so other runtimes keep their prompt byte for byte.
    const section = prompt.slice(subagents, mentions);
    expect(prompt.replace(section, '')).toBe(codex.instructions);
    expect(claude.fingerprint).not.toBe(codex.fingerprint);
});

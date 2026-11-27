import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

const prompt = renderAgentInstructions({
    agentId: 'agt_efficiency',
    agentName: 'Marlow',
    homeTimezone: 'America/New_York',
    hostname: 'computer.test',
    initialRole: null,
    os: 'macOS',
    runtimeVersion: 'test',
    workspacePath: '/workspace',
});

test('memory arrives in the turn input under a cap, with no re-read ritual (ADR 0052)', () => {
    expect(prompt).toContain(
        '2. MEMORY.md (in `drive/agents/Marlow/`) arrives in your turn input whenever it changed. Read only the additional memory/files you need to handle the current turn well.'
    );
    expect(prompt).toContain(
        'Your **MEMORY.md** and `notes/` live in Drive at `drive/agents/Marlow/` in your cwd: everyone on the team can read them, and Haus keeps their history.'
    );
    expect(prompt).toContain(
        'Haus puts MEMORY.md in your turn input whenever it changed, and again after context compression. Keep it under 8,000 characters, with everything durable in it or reachable from it; Haus cuts a longer file.'
    );
    expect(prompt).toContain('MEMORY.md is your recovery point after compression');
    expect(prompt).not.toContain('Re-read MEMORY.md');
});

test('describes the rule files beside MEMORY.md (ADR 0054 decisions 7 and 10)', () => {
    expect(prompt).toContain(
        '- `AGENTS.md` beside MEMORY.md holds your standing rules, and Haus puts it in your turn input whenever it changed. `WORKER.md` there holds the rules your crew Tasks follow. The `rules` Manual topic covers both.'
    );
    expect(prompt).toContain(
        '## Standing Preferences\n<preferences people show in passing: terse imperative lines; the rules people set live in AGENTS.md and WORKER.md>'
    );
    expect(prompt).not.toContain('standing directives');
});

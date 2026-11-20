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

test('sends a "from now on" rule to its rule file, not MEMORY.md (ADR 0054 decision 10)', () => {
    expect(prompt).toContain(
        '- **Rules live in rule files**: a standing rule someone sets ("from now on…") goes in `WORKER.md` beside MEMORY.md when it governs what your Workers do, else in `AGENTS.md` there, never in MEMORY.md (`rules` Manual topic).'
    );
    expect(prompt).not.toContain('standing directives');
});

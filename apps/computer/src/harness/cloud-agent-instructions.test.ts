import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

test('cloud work teaches automatic inbox delivery without a backup reminder', () => {
    const prompt = renderAgentInstructions({
        agentId: 'agt_prompt_test',
        agentName: 'Blippy',
        homeTimezone: 'UTC',
        hostname: 'computer.test',
        initialRole: null,
        os: 'macOS',
        runtimeVersion: 'test',
        workspacePath: '/workbench',
    });
    const section = prompt.split('### Cloud agents\n')[1]?.split('### Threads')[0];
    expect(section).toContain('completes, fails, or is canceled');
    expect(section).toContain('automatically delivers an inbox item with the result and wakes you');
    expect(section).toContain('a later turn if you are busy');
    expect(section).toContain('You do not need to set a reminder or poll');
    // Revision mechanics and the work thread's role live in the `cloud-agents` Manual topic the
    // family entry requires reading first.
    expect(section).not.toContain('haus cloud-agent send');
    expect(section).not.toContain('implementation details and revisions');
    // Where updates go (work thread vs. requester) lives in the `cloud-agents` Manual topic too.
    expect(section).not.toContain('keep the requester informed');
    expect(section).not.toContain('Follow their lead when they join the work thread.');
    expect(section).toContain('bring back a concise outcome with a link to the work');
});

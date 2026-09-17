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
        webAccess: null,
        workspacePath: '/workbench',
    });
    const section = prompt.split('### Cloud agents\n')[1]?.split('### Threads')[0];
    expect(section).toContain('completes, fails, or is canceled');
    expect(section).toContain('automatically delivers an inbox item with the result and wakes you');
    expect(section).toContain('a later turn if you are busy');
    expect(section).toContain('You do not need to set a reminder or poll');
    expect(section).toContain('haus cloud-agent send --work <workId>');
    expect(section).toContain(
        'The work thread is the place for implementation details and revisions.'
    );
    expect(section).toContain('keep the requester informed where they asked for the work');
    expect(section).toContain('bring back a concise outcome with a link to the work');
    expect(section).toContain('Follow their lead when they join the work thread.');
});

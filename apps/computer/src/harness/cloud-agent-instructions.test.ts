import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

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
const section = prompt.split('### Cloud agents\n')[1]?.split('### ')[0] ?? '';

test('a cloud agent works for a Task, and the launch names it', () => {
    expect(section).toContain(
        'A cloud agent works for a Task: start the Task first, then `haus cloud-agent start --task <KEY-n>`.'
    );
    expect(section).not.toContain('launch card');
    expect(section).not.toContain('work thread');
    expect(section).not.toContain('a launch never opens a new thread');
});

test('Haus wakes the Agent on the Task when a run settles or its pull request changes', () => {
    expect(section).toContain('completes, fails, or is canceled');
    expect(section).toContain('when its pull request becomes ready or its checks finish');
    expect(section).toContain('Haus delivers an inbox item and wakes you on that Task');
    expect(section).toContain('a later turn if you are busy');
    expect(section).not.toContain('You do not need to set a reminder or poll');
    expect(section).toContain('bring back a concise outcome with a link to the work in the Task');
});

test('revision mechanics stay in the `cloud-agents` Manual topic', () => {
    expect(section).not.toContain('haus cloud-agent send');
    expect(section).not.toContain('implementation details and revisions');
    expect(section).not.toContain('keep the requester informed');
});

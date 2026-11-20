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
const section = prompt.split('### Workers\n')[1]?.split('### ')[0] ?? '';

test('the Workers family names the place a start runs on', () => {
    expect(prompt).toContain(
        '13. **Workers**: `haus worker start --on <place>`, `haus worker send`, `haus worker inspect`, `haus worker stop`. Read the `workers` Manual topic before the first one.'
    );
    expect(prompt).not.toContain('cloud-agent');
    expect(prompt.toLowerCase()).not.toContain('cloud agent');
});

test('a Worker report posts in the Task and reaches the Agent as an inbox item', () => {
    expect(section.trim()).toBe(
        "When a Worker's turn ends, its report posts in the Task as a Message and reaches you as an inbox item on that Task, or in a later turn if you are busy. A pull request it reported reaches you the same way when it becomes ready or its checks finish."
    );
});

test('launch, revision, and report-handling mechanics stay out of the section', () => {
    expect(section).not.toContain('haus worker');
    expect(section).not.toContain('bring back a concise outcome');
    expect(section).not.toContain('keep the requester informed');
    expect(section).not.toContain('You do not need to set a reminder or poll');
});

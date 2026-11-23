import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

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

test('lists the Computers family just before Manual', () => {
    expect(prompt).toContain(
        '\n16. **Computers**: `haus computer list`. Read the `computers` Manual topic before the first call that targets another Computer.\n17. **Manual**: `haus manual get`'
    );
    expect(prompt).not.toContain('18. **');
});

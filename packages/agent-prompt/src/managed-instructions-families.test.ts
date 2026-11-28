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

test('lists the Computers and Repos families just before Manual', () => {
    expect(prompt).toContain(
        "\n16. **Computers**: `haus computer list`.\n17. **Repos**: `haus repo` (`list`, and `checkout`, your own worktree of a repo already on the call's Computer).\n18. **Manual**: `haus manual` (`get`, `search`)."
    );
    expect(prompt).not.toContain('19. **');
});

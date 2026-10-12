import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

// Raft reaches its Artifacts App through Integrations plus a Manual pointer; Haus artifacts are
// native, so they get a family entry beside Attachments (register: CLI ONLY, command families).
test('the Artifacts family entry points at the artifact Manual topic', () => {
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
        '6. **Attachments**: `haus attachment upload`, `haus attachment view`.\n7. **Artifacts**: `haus artifact publish`, `haus artifact list`, `haus artifact view`. Read the `artifact` Manual topic before the first one.\n8. **Profiles**'
    );
});

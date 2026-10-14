import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

// Raft reaches its Artifacts App through Integrations plus a Manual pointer; Haus's shared files
// (Files) are native, so they get a family entry beside Attachments (register: CLI ONLY, command
// families).
test('the Files family entry points at the files Manual topic', () => {
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
        '6. **Attachments**: `haus attachment upload`, `haus attachment view`.\n7. **Files**: `haus files list`, `haus files pull`, `haus files push`. Read the `files` Manual topic before the first one.\n8. **Profiles**'
    );
    expect(prompt).not.toContain('haus artifact');
});

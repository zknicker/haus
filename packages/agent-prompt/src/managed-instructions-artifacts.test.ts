import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

// Raft reaches its Artifacts App through Integrations plus a Manual pointer; Haus's Drive is
// native and edited through the Agent's drive/ folder, so it gets a family entry beside
// Attachments (register: CLI ONLY, command families).
test('the Drive family entry points at the drive/ folder and the drive Manual topic', () => {
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

    expect(prompt).toContain(
        '6. **Attachments**: `haus attachment upload`, `haus attachment view`.\n7. **Drive**: shared files live in your `drive/` folder; use file commands there. Read the `drive` Manual topic before your first edit.\n8. **Profiles**'
    );
    expect(prompt).not.toMatch(/haus artifact|haus files/u);
    // Pages are `page` fences opening in the Workspace pane; no artifact wording remains.
    expect(prompt).not.toMatch(/artifact (fence|page|pane)/iu);
    expect(prompt).toContain('full documents get pages.');
    expect(prompt).not.toContain('keepable');
});

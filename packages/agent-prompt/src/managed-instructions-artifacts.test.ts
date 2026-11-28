import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

// Drive is native and edited through the Agent's drive/ folder, so it gets a family entry
// beside Attachments.
test('the Drive family entry points at the drive/ folder, and every family at its Manual topic', () => {
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
        '6. **Attachments**: `haus attachment` (`upload`, `view`).\n7. **Drive**: shared files live in your `drive/` folder; use file commands there.\n8. **Profiles**'
    );
    // Capy prompt v2 item 8: one pointer replaces a "read the topic first" line per family.
    expect(prompt).toContain(
        "The Manual topic for a family (`haus manual get <family>`) covers how to use it well, so read it before that family's first use in a session."
    );
    expect(prompt).not.toContain('Manual topic before the first one');
    expect(prompt).not.toMatch(/haus artifact|haus files/u);
    // Pages are `page` fences opening in the Workspace pane; no artifact wording remains.
    expect(prompt).not.toMatch(/artifact (fence|page|pane)/iu);
    expect(prompt).toContain('full documents get pages.');
    expect(prompt).not.toContain('keepable');
});

import { expect, test } from 'bun:test';
import { buildClaimCommandGroup } from './claim-commands.ts';
import type { AppCommand } from './types.ts';
import { getCommandSearchText } from './types.ts';

test('the palette entry reads as what pressing it does and flips the preference', async () => {
    const applied: boolean[] = [];
    const setShowClaimsInChat = (enabled: boolean) => applied.push(enabled);
    const hidden = toggleCommand(
        buildClaimCommandGroup({ setShowClaimsInChat, showClaimsInChat: false })
    );
    const showing = toggleCommand(
        buildClaimCommandGroup({ setShowClaimsInChat, showClaimsInChat: true })
    );

    expect(hidden.id).toBe('claims.show-in-chat');
    expect(hidden.title).toBe('Show claims in chat');
    expect(showing.title).toBe('Hide claims in chat');
    expect(getCommandSearchText(hidden).toLowerCase()).toContain('claim');

    await hidden.run();
    await showing.run();

    expect(applied).toEqual([true, false]);
});

function toggleCommand(group: { commands: readonly AppCommand[] }): AppCommand {
    const [command, ...rest] = group.commands;

    if (!command || rest.length > 0) {
        throw new Error('the Claims group should carry exactly one command');
    }

    return command;
}

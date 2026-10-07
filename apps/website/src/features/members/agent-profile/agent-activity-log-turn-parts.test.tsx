import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LogChatButton, readChatTarget } from './agent-activity-log-turn-parts.tsx';

const dm = { kind: 'text', place: 'DM', text: 'Ship it' } as const;
const message = { author: 'human', chatId: 'cht_dm', kind: 'message', messageId: 'msg' } as const;

test('a header offers its Chat only for a visible request in a known place', () => {
    expect(readChatTarget(dm, message)).toEqual({ chatId: 'cht_dm', place: 'DM' });
    expect(readChatTarget(dm, { kind: 'private' })).toBeNull();
    expect(readChatTarget(dm, null)).toBeNull();
    expect(readChatTarget({ ...dm, place: null }, message)).toBeNull();
    expect(readChatTarget({ kind: 'none' }, message)).toBeNull();
    expect(readChatTarget({ kind: 'pending', place: 'DM' }, message)).toBeNull();
});

test('a DM header button names the Agent; a channel one names the channel', () => {
    expect(button('DM')).toContain('aria-label="View in DM with Tiny"');
    expect(button('#product')).toContain('aria-label="View in #product"');
});

function button(place: string) {
    return renderToStaticMarkup(
        <MemoryRouter>
            <LogChatButton agentName="Tiny" serverSlug="dev" target={{ chatId: 'cht', place }} />
        </MemoryRouter>
    );
}

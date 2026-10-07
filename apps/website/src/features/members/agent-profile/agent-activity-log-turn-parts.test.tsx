import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readTraceScale } from '../../turn-trace/turn-trace-scale.ts';
import { LogChatButton, readChatTarget, TurnRuler } from './agent-activity-log-turn-parts.tsx';

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

test('the Chat button sits at the end of the header track, not over the title or a ruler', () => {
    const markup = button('DM');
    expect(markup).toContain('col-start-3');
    expect(markup).toContain('justify-self-end');
    // The narrow log has no track: the icon takes the end of the title instead.
    expect(markup).toContain('@max-2xl/activity-log:col-start-2');
});

test('a ruler is its own thin row: the track column only, hidden and inert', () => {
    const scale = readTraceScale(32_000);
    if (!scale) {
        throw new Error('a 32s turn has a scale');
    }
    const markup = renderToStaticMarkup(<TurnRuler scale={scale} />);
    const row = markup.match(/<div[^>]*data-log-ruler[^>]*>/)?.[0] ?? '';
    expect(row).toContain('aria-hidden="true"');
    expect(row).toContain('pointer-events-none');
    expect(row).not.toContain('tabindex');
    expect(markup).toContain('data-trace-ruler="40000"');
    expect(markup).toContain('col-start-3');
    // No time, label, or duration cell: nothing but the track.
    expect(markup).not.toMatch(/data-trace-cell="(time|label|duration|slot)"/);
    expect(markup).not.toMatch(/<(button|a)\b/);
});

function button(place: string) {
    return renderToStaticMarkup(
        <MemoryRouter>
            <LogChatButton agentName="Tiny" serverSlug="dev" target={{ chatId: 'cht', place }} />
        </MemoryRouter>
    );
}

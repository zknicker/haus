import { expect, test } from 'bun:test';
import type { AutomationFireContext, MessageCause } from '@haus/api';
import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AutomationFireContextCardView } from './automation-fire-context-card.tsx';
import { MessageCauseHoverContent, MessageCauseLine } from './message-cause-line.tsx';

// A Reminder's title is a short label; its description is what it stands for.
const description = 'Look back at the week, list what slipped, and plan the next one';

test('a Reminder cause line shows only its short title; the hover card adds the description', () => {
    const cause = reminderCause({ instruction: 'weekly-review --quiet-when-ok' });
    const line = render(<MessageCauseLine cause={cause} />);
    const hover = render(<MessageCauseHoverContent cause={cause} />);

    expect(line).toContain('Weekly Self-Review');
    expect(line).not.toContain(description);
    expect(hover).toContain(description);
    expect(hover).toContain('weekly-review --quiet-when-ok');
    // The description reads under the title, before the cadence and facts.
    expect(hover.indexOf(description)).toBeLessThan(hover.indexOf('Every Monday at 09:00'));
});

test('a hover card says a description once when the title or script repeats it', () => {
    const backfilled = render(
        <MessageCauseHoverContent cause={{ ...reminderCause(), title: description }} />
    );
    const scripted = render(
        <MessageCauseHoverContent cause={reminderCause({ instruction: description })} />
    );

    expect(backfilled.split(description)).toHaveLength(2);
    expect(scripted.split(description)).toHaveLength(2);
});

test('a Reminder context card carries its description under the title', () => {
    const markup = render(<AutomationFireContextCardView context={reminderContext()} />);

    expect(markup).toContain(description);
    expect(markup.indexOf('Weekly Self-Review')).toBeLessThan(markup.indexOf(description));
});

function render(element: React.ReactElement) {
    return renderToStaticMarkup(
        <MemoryRouter initialEntries={['/s/dev/c/cht_dm']}>
            <Routes>
                <Route element={element} path="/s/:slug/*" />
            </Routes>
        </MemoryRouter>
    );
}

function reminderCause({ instruction = null }: { instruction?: string | null } = {}): MessageCause {
    return {
        attribution: 'explicit',
        automationId: 'rem_review',
        description,
        firedAt: '2026-08-27T13:00:00.000Z',
        fireId: 'rmf_6',
        kind: 'reminder',
        live: {
            fireCount: 6,
            instruction,
            lastFiredAt: '2026-08-27T13:00:00.000Z',
            status: 'scheduled',
        },
        ownerAgentId: 'agt_blippy',
        summary: 'Every Monday at 09:00',
        title: 'Weekly Self-Review',
    };
}

function reminderContext(): AutomationFireContext {
    return {
        anchorChatId: 'cht_dm',
        anchorExcerpt: 'Remind me to write the weekly self-review',
        anchorMessageId: 'msg_anchor',
        cause: reminderCause(),
        contentType: null,
        firedAt: '2026-08-27T13:00:00.000Z',
        fireOrdinal: 6,
        fireTotal: 6,
        nextFireAt: null,
        payload: null,
        payloadBytes: null,
        payloadTruncated: false,
        repeat: 'Every Monday at 09:00',
    };
}

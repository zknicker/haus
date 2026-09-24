import { expect, test } from 'bun:test';
import type { AutomationFireContext, MessageCause } from '@haus/api';
import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AutomationFireContextCardView } from './automation-fire-context-card.tsx';
import { MessageCauseHoverContent, MessageCauseMark } from './message-cause-mark.tsx';

test('the header mark names its automation in that automation’s own ink', () => {
    const trigger = render(<MessageCauseMark cause={triggerCause()} />);
    const reminder = render(<MessageCauseMark cause={reminderCause()} />);

    expect(trigger).toContain('Deploy finished');
    expect(trigger).toContain('text-trigger-mark');
    expect(trigger).not.toContain('text-reminder-mark');
    expect(reminder).toContain('Weekly self-review');
    expect(reminder).toContain('text-reminder-mark');
    // Neither borrows a status colour: a fired automation is not a warning.
    expect(trigger + reminder).not.toContain('text-warning');
    expect(trigger + reminder).not.toContain('text-danger');
});

test('the hover card previews the automation without management links', () => {
    const markup = render(<MessageCauseHoverContent cause={triggerCause()} />);

    expect(markup).toContain('Deploy finished');
    expect(markup).toContain('· Webhook');
    expect(markup).toContain('Armed · Last fired 4m ago · 12 fires');
    expect(markup).toContain('Summarize the deploy in this DM; flag failures.');
    expect(markup).toContain('haus-hover-card__identity');
    // A preview, not a control panel: managing lives in Automations.
    expect(markup).not.toContain('<a');
    expect(markup).not.toContain('Manage in Automations');
});

test('a hover card says when Haus inferred the link rather than the Agent naming it', () => {
    const inferred = render(
        <MessageCauseHoverContent cause={{ ...triggerCause(), attribution: 'inferred' }} />
    );

    expect(inferred).toContain('Attributed by Haus');
    // An unqualified mark already means the Agent said so, so an explicit
    // cause carries no note.
    expect(render(<MessageCauseHoverContent cause={triggerCause()} />)).not.toContain(
        'Attributed by Haus'
    );
});

test('a Reminder hover card trades the fire count for its cadence', () => {
    const markup = render(<MessageCauseHoverContent cause={reminderCause()} />);

    expect(markup).toContain('>Every Monday at 09:00</p>');
    expect(markup).not.toContain('· Every Monday at 09:00');
    expect(markup).toContain('Scheduled');
    expect(markup).not.toContain('fires');
});

test('the Thread context card states the fire and offers its payload', () => {
    const markup = render(<AutomationFireContextCardView context={triggerContext()} />);

    expect(markup).toContain('Deploy finished');
    expect(markup).toContain('of 12');
    expect(markup).toContain('Payload · 52 bytes · application/json');
    expect(markup).toContain('bg-nested-surface');
});

test('a Reminder context card carries its anchoring note and no payload', () => {
    const markup = render(<AutomationFireContextCardView context={reminderContext()} />);

    expect(markup).toContain('Every Monday at 09:00');
    expect(markup).toContain('Anchored on:');
    expect(markup).not.toContain('Payload');
    expect(markup).toContain('/s/dev/agents/agt_blippy/automations');
});

test('an archived automation keeps its mark exactly as a live one has it', () => {
    const archived = render(<MessageCauseMark cause={archivedReminderCause()} />);

    expect(archived).toBe(render(<MessageCauseMark cause={reminderCause()} />));
    expect(archived).toContain('Weekly self-review');
    expect(archived).toContain('text-reminder-mark');
});

test('an archived hover card states the snapshot and says the record is gone', () => {
    const markup = render(<MessageCauseHoverContent cause={archivedTriggerCause()} />);

    expect(markup).toContain('Deploy finished');
    expect(markup).toContain('Webhook');
    expect(markup).toContain('Archived · Fired 4m ago');
    // The live facts and the standing instruction go with the record.
    expect(markup).not.toContain('Armed');
    expect(markup).not.toContain('Last fired');
    expect(markup).not.toContain('fires');
    expect(markup).not.toContain('Summarize the deploy in this DM; flag failures.');
});

test('an archived context card drops the status, the payload, and the way out', () => {
    const markup = render(<AutomationFireContextCardView context={archivedTriggerContext()} />);

    expect(markup).toContain('Deploy finished');
    expect(markup).toContain('Webhook');
    expect(markup).toContain('This trigger has been archived.');
    expect(markup).not.toContain('Armed');
    expect(markup).not.toContain('of 12');
    expect(markup).not.toContain('Payload');
    expect(markup).not.toContain('Manage in Automations');
});

test('an archived Reminder context card keeps its cadence and loses its anchor note', () => {
    const markup = render(<AutomationFireContextCardView context={archivedReminderContext()} />);

    expect(markup).toContain('Every Monday at 09:00');
    expect(markup).toContain('This reminder has been archived.');
    expect(markup).not.toContain('Anchored on:');
    expect(markup).not.toContain('Scheduled');
});

/** Rendered where the transcript lives, so the manage link resolves a real slug. */
function render(element: React.ReactElement) {
    return renderToStaticMarkup(
        <MemoryRouter initialEntries={['/s/dev/c/cht_dm']}>
            <Routes>
                <Route element={element} path="/s/:slug/*" />
            </Routes>
        </MemoryRouter>
    );
}

function triggerCause(): MessageCause {
    return {
        attribution: 'explicit',
        automationId: 'trg_deploy',
        firedAt: relativeMinutesAgo(4),
        fireId: 'trf_12',
        kind: 'trigger',
        live: {
            fireCount: 12,
            instruction: 'Summarize the deploy in this DM; flag failures.',
            lastFiredAt: relativeMinutesAgo(4),
            status: 'armed',
        },
        ownerAgentId: 'agt_blippy',
        summary: 'Webhook',
        title: 'Deploy finished',
    };
}

function reminderCause(): MessageCause {
    return {
        attribution: 'explicit',
        automationId: 'rem_review',
        firedAt: '2026-08-27T13:00:00.000Z',
        fireId: 'rmf_6',
        kind: 'reminder',
        live: {
            fireCount: 6,
            instruction: null,
            lastFiredAt: '2026-08-27T13:00:00.000Z',
            status: 'scheduled',
        },
        ownerAgentId: 'agt_blippy',
        summary: 'Every Monday at 09:00',
        title: 'Weekly self-review',
    };
}

function triggerContext(): AutomationFireContext {
    return {
        anchorChatId: 'cht_dm',
        anchorExcerpt: null,
        anchorMessageId: null,
        cause: triggerCause(),
        contentType: 'application/json',
        firedAt: relativeMinutesAgo(4),
        fireOrdinal: 12,
        fireTotal: 12,
        nextFireAt: null,
        payload: '{\n  "repo": "haus"\n}',
        payloadBytes: 52,
        payloadTruncated: false,
        repeat: null,
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

function relativeMinutesAgo(minutes: number) {
    return new Date(Date.now() - minutes * 60_000).toISOString();
}

function archivedTriggerCause(): MessageCause {
    return { ...triggerCause(), live: null };
}

function archivedReminderCause(): MessageCause {
    return { ...reminderCause(), live: null };
}

/** Archived: the Server nulls every kind-specific field with the record. */
function archivedTriggerContext(): AutomationFireContext {
    return {
        ...triggerContext(),
        cause: archivedTriggerCause(),
        contentType: null,
        fireOrdinal: null,
        fireTotal: null,
        payload: null,
        payloadBytes: null,
    };
}

function archivedReminderContext(): AutomationFireContext {
    return {
        ...reminderContext(),
        anchorExcerpt: null,
        cause: archivedReminderCause(),
        fireOrdinal: null,
        fireTotal: null,
        nextFireAt: null,
        repeat: null,
    };
}

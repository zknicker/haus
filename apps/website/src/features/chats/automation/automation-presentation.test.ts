import { expect, test } from 'bun:test';
import type { AutomationFireContext, MessageCause } from '@haus/api';
import {
    automationStatusChip,
    fireContextAnchorNote,
    fireContextMetaParts,
    fireContextPayloadLabel,
    fireContextPayloadLanguage,
    formatUpcomingTime,
    messageCauseArchivedNote,
    messageCauseAttributionNote,
    messageCauseHoverFacts,
} from './automation-presentation.ts';

const now = Date.parse('2026-09-03T12:00:00.000Z');

test('only a live automation status carries colour', () => {
    expect(automationStatusChip('armed')).toEqual({ color: 'success', label: 'Armed' });
    expect(automationStatusChip('scheduled')).toEqual({ color: 'accent', label: 'Scheduled' });
    expect(automationStatusChip('disabled')).toEqual({ color: 'default', label: 'Disabled' });
    expect(automationStatusChip('canceled')).toEqual({ color: 'default', label: 'Canceled' });
    expect(automationStatusChip('fired')).toEqual({ color: 'default', label: 'Fired' });
});

test('a Trigger previews its status, last fire, and fire count', () => {
    expect(messageCauseHoverFacts(triggerCause(), now)).toEqual([
        'Armed',
        'Last fired 4m ago',
        '12 fires',
    ]);
    expect(
        messageCauseHoverFacts(
            { ...triggerCause(), live: { ...liveTrigger(), fireCount: 1 } },
            now
        ).at(-1)
    ).toBe('1 fire');
});

test('a Reminder previews no fire count', () => {
    expect(messageCauseHoverFacts(reminderCause(), now)).toEqual([
        'Scheduled',
        'Last fired 7d ago',
    ]);
});

test('an automation that has never fired says so rather than showing a date', () => {
    const cause: MessageCause = {
        ...triggerCause(),
        live: { ...liveTrigger(), lastFiredAt: null },
    };

    expect(messageCauseHoverFacts(cause, now)).toContain('Never fired');
});

test('a Trigger fire states its kind, when it fired, and its place in the history', () => {
    expect(fireContextMetaParts(triggerContext(), now)).toEqual([
        { value: 'Webhook' },
        { prefix: 'Fired', value: '4m ago' },
        { prefix: 'fire', suffix: 'of 12', value: '12' },
    ]);
});

test('a Reminder fire states its cadence and its next fire', () => {
    const parts = fireContextMetaParts(reminderContext(), now);

    expect(parts[0]).toEqual({ value: 'Every Monday at 09:00' });
    expect(parts[1]?.prefix).toBe('Next');
    expect(parts[1]?.value).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}:\d{2}\s(AM|PM)$/u);
});

test('a canceled Reminder with no next fire states only its cadence', () => {
    expect(fireContextMetaParts({ ...reminderContext(), nextFireAt: null }, now)).toHaveLength(1);
});

test('the payload disclosure names the bytes that arrived and their content type', () => {
    expect(fireContextPayloadLabel(triggerContext())).toBe('Payload · 52 bytes · application/json');
    expect(fireContextPayloadLabel({ ...triggerContext(), contentType: null })).toBe(
        'Payload · 52 bytes'
    );
    expect(
        fireContextPayloadLabel({ ...triggerContext(), payload: null, payloadBytes: null })
    ).toBeNull();
});

test('payload highlighting reads the media type, not the whole content-type header', () => {
    expect(fireContextPayloadLanguage('application/json; charset=utf-8')).toBe('json');
    expect(fireContextPayloadLanguage('application/vnd.github+json')).toBe('json');
    expect(fireContextPayloadLanguage('application/xml')).toBe('xml');
    expect(fireContextPayloadLanguage('application/x-www-form-urlencoded')).toBe('plaintext');
    expect(fireContextPayloadLanguage(null)).toBe('plaintext');
});

test('a Reminder quotes the message it was set from, and a Trigger has none', () => {
    expect(fireContextAnchorNote(reminderContext())).toBe(
        'Anchored on: “Remind me to write the weekly self-review”'
    );
    expect(fireContextAnchorNote(triggerContext())).toBeNull();
});

test('a fire within the week reads by weekday and falls back to a date past it', () => {
    expect(formatUpcomingTime('2026-09-07T13:00:00.000Z', now)).toMatch(
        /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) /u
    );
    expect(formatUpcomingTime('2026-10-07T13:00:00.000Z', now)).toMatch(/^Oct \d+/u);
});

test('an archived automation previews its snapshot and drops the live facts', () => {
    expect(messageCauseHoverFacts(archivedTriggerCause(), now)).toEqual([
        'Archived',
        'Fired 4m ago',
    ]);
    expect(messageCauseHoverFacts(archivedReminderCause(), now)).toEqual([
        'Archived',
        'Fired 7d ago',
    ]);
});

test('only an archived automation says so, and it says which kind', () => {
    expect(messageCauseArchivedNote(triggerCause())).toBeNull();
    expect(messageCauseArchivedNote(reminderCause())).toBeNull();
    expect(messageCauseArchivedNote(archivedTriggerCause())).toBe(
        'This trigger has been archived.'
    );
    expect(messageCauseArchivedNote(archivedReminderCause())).toBe(
        'This reminder has been archived.'
    );
});

test('an archived fire states what fired and when, and nothing it no longer knows', () => {
    expect(fireContextMetaParts(archivedTriggerContext(), now)).toEqual([
        { value: 'Webhook' },
        { prefix: 'Fired', value: '4m ago' },
    ]);
    expect(fireContextMetaParts(archivedReminderContext(), now)).toEqual([
        { value: 'Every Monday at 09:00' },
        { prefix: 'Fired', value: '7d ago' },
    ]);
});

test('a live Trigger fire whose own fire row expired drops its place in the history', () => {
    expect(
        fireContextMetaParts({ ...triggerContext(), fireOrdinal: null, fireTotal: null }, now)
    ).toEqual([{ value: 'Webhook' }, { prefix: 'Fired', value: '4m ago' }]);
});

test('only an inferred cause explains itself', () => {
    expect(messageCauseAttributionNote(triggerCause())).toBeNull();
    expect(messageCauseAttributionNote({ ...triggerCause(), attribution: 'inferred' })).toContain(
        'Attributed by Haus'
    );
});

function liveTrigger(): NonNullable<MessageCause['live']> {
    return {
        fireCount: 12,
        instruction: 'Summarize the deploy in this DM; flag failures.',
        lastFiredAt: '2026-09-03T11:56:00.000Z',
        status: 'armed',
    };
}

function triggerCause(): MessageCause {
    return {
        attribution: 'explicit',
        automationId: 'trg_deploy',
        firedAt: '2026-09-03T11:56:00.000Z',
        fireId: 'trf_12',
        kind: 'trigger',
        live: liveTrigger(),
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
        firedAt: '2026-09-03T11:56:00.000Z',
        fireOrdinal: 12,
        fireTotal: 12,
        nextFireAt: null,
        payload: '{"repo":"haus"}',
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
        nextFireAt: '2026-09-07T13:00:00.000Z',
        payload: null,
        payloadBytes: null,
        payloadTruncated: false,
        repeat: 'Every Monday at 09:00',
    };
}

function archivedTriggerCause(): MessageCause {
    return { ...triggerCause(), live: null };
}

function archivedReminderCause(): MessageCause {
    return { ...reminderCause(), live: null };
}

/** Archived: every kind-specific field the Server read live is null with it. */
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

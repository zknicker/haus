import { expect, test } from 'bun:test';

import type { MessageCause } from '@haus/api';

import {
    automationStatusChip,
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
        description: null,
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
        description: null,
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

function archivedTriggerCause(): MessageCause {
    return { ...triggerCause(), live: null };
}

function archivedReminderCause(): MessageCause {
    return { ...reminderCause(), live: null };
}

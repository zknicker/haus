import { expect, test } from 'bun:test';
import type { Trigger } from '@haus/api';
import {
    canCreateTrigger,
    canSaveTriggerEdit,
    canTestTrigger,
    formatTriggerActivity,
    formatTriggerFireDetail,
    formatTriggerFireTime,
    formatTriggerHistoryTime,
    formatTriggerPayloadSize,
    formatTriggerRowDetail,
    resolveTriggerSheetMode,
    triggerCreatorName,
    triggerEditPatch,
    triggerInstructionIssue,
    triggerKindLabel,
    triggerKindOption,
    triggerKindOptions,
    triggerStatusChip,
    triggerTitleIssue,
} from './agent-trigger-model.ts';

const now = new Date('2026-09-02T12:00:00.000Z').getTime();

test('an armed Trigger reads as live', () => {
    expect(triggerStatusChip('armed')).toEqual({ color: 'success', label: 'Armed' });
});

test('a disabled Trigger reads as inert rather than as a failure', () => {
    expect(triggerStatusChip('disabled')).toEqual({ color: 'default', label: 'Disabled' });
});

test('an unfired Trigger states that once instead of also saying "0 fires"', () => {
    expect(formatTriggerActivity({ fireCount: 0, lastFiredAt: null }, now)).toBe('Never fired');
});

test('a Trigger with no recorded last fire still reads as never fired', () => {
    expect(formatTriggerActivity({ fireCount: 3, lastFiredAt: null }, now)).toBe('Never fired');
});

test('a fired Trigger pairs its relative last fire with its count', () => {
    expect(
        formatTriggerActivity({ fireCount: 12, lastFiredAt: '2026-09-02T09:00:00.000Z' }, now)
    ).toBe('Last fired 3h ago · 12 fires');
});

test('a single fire is not pluralised', () => {
    expect(
        formatTriggerActivity({ fireCount: 1, lastFiredAt: '2026-09-01T12:00:00.000Z' }, now)
    ).toBe('Last fired 1d ago · 1 fire');
});

test('every offered kind carries the label and description the picker shows', () => {
    expect(triggerKindOptions).toEqual([
        {
            description: 'An outside system POSTs to a private URL',
            kind: 'webhook',
            label: 'Webhook',
        },
    ]);
    expect(triggerKindOption('webhook').label).toBe('Webhook');
    expect(triggerKindLabel('webhook')).toBe('Webhook');
});

test('a row leads with what wakes the Trigger, then how it has been used', () => {
    expect(
        formatTriggerRowDetail(
            { fireCount: 2, kind: 'webhook', lastFiredAt: '2026-09-02T11:00:00.000Z' },
            now
        )
    ).toBe('Webhook · Last fired 1h ago · 2 fires');
});

test('a human-created Trigger credits the handle, an Agent-created one the Agent', () => {
    expect(triggerCreatorName({ createdByHandle: 'zach' }, 'Blippy')).toBe('@zach');
    expect(triggerCreatorName({ createdByHandle: null }, 'Blippy')).toBe('Blippy');
});

test('payload size reads in the unit a person would say it in', () => {
    expect(formatTriggerPayloadSize(0)).toBe('0 bytes');
    expect(formatTriggerPayloadSize(1)).toBe('1 byte');
    expect(formatTriggerPayloadSize(512)).toBe('512 bytes');
    expect(formatTriggerPayloadSize(1536)).toBe('1.5 KB');
    expect(formatTriggerPayloadSize(65_536)).toBe('64 KB');
});

test('a fire states only the facts its sender actually supplied', () => {
    expect(
        formatTriggerFireDetail({
            contentType: 'application/json',
            dedupeKey: null,
            payloadBytes: 42,
        })
    ).toBe('42 bytes · application/json');
    expect(
        formatTriggerFireDetail({ contentType: null, dedupeKey: 'build-19', payloadBytes: 2048 })
    ).toBe('2 KB · key build-19');
});

test('history and detail use the same execution timestamp format', () => {
    const receivedAt = '2026-09-02T11:00:00.000Z';
    expect(formatTriggerHistoryTime(receivedAt)).toBe(formatTriggerFireTime({ receivedAt }));
});

test('Create waits for a name and a kind, and the instruction stays optional', () => {
    expect(canCreateTrigger({ instruction: '', kind: null, title: '' })).toBe(false);
    expect(canCreateTrigger({ instruction: '', kind: null, title: 'Deploy finished' })).toBe(false);
    expect(canCreateTrigger({ instruction: '', kind: 'webhook', title: '   ' })).toBe(false);
    expect(canCreateTrigger({ instruction: '', kind: 'webhook', title: 'Deploy finished' })).toBe(
        true
    );
});

test('an over-long name or instruction states its bound and blocks Create', () => {
    expect(triggerTitleIssue('ok')).toBeNull();
    expect(triggerTitleIssue('a'.repeat(201))).toBe('Keep the name under 200 characters.');
    expect(triggerInstructionIssue('ok')).toBeNull();
    // Multi-byte characters count as bytes, which is the Server's own bound.
    expect(triggerInstructionIssue('é'.repeat(2049))).toBe(
        'Keep the instruction under 4096 bytes.'
    );
    expect(canCreateTrigger({ instruction: '', kind: 'webhook', title: 'a'.repeat(201) })).toBe(
        false
    );
});

const saved = { instruction: 'Summarise the build.', title: 'Deploy finished' };

test('an unchanged edit has no patch and cannot be saved', () => {
    expect(
        triggerEditPatch({ instruction: saved.instruction, title: saved.title }, saved)
    ).toBeNull();
    expect(canSaveTriggerEdit({ instruction: saved.instruction, title: saved.title }, saved)).toBe(
        false
    );
});

test('an edit sends only the field that changed', () => {
    expect(
        triggerEditPatch({ instruction: saved.instruction, title: 'Deploy done' }, saved)
    ).toEqual({ title: 'Deploy done' });
    expect(triggerEditPatch({ instruction: 'Post the diff.', title: saved.title }, saved)).toEqual({
        instruction: 'Post the diff.',
    });
});

test('clearing the instruction sends null rather than an empty string', () => {
    expect(triggerEditPatch({ instruction: '   ', title: saved.title }, saved)).toEqual({
        instruction: null,
    });
    expect(
        triggerEditPatch(
            { instruction: '', title: saved.title },
            { instruction: null, title: saved.title }
        )
    ).toBeNull();
});

test('an emptied name is not a save; the Server requires a title', () => {
    expect(canSaveTriggerEdit({ instruction: saved.instruction, title: '  ' }, saved)).toBe(false);
});

test('only an armed Trigger can be test-fired', () => {
    expect(canTestTrigger({ status: 'armed' })).toBe(true);
    expect(canTestTrigger({ status: 'disabled' })).toBe(false);
});

const row: Trigger = {
    anchorChatId: 'chat_1',
    // A human-created Trigger anchors on its DM chat and has no asking message.
    anchorMessageId: null,
    createdAt: '2026-09-01T12:00:00.000Z',
    createdByHandle: 'zach',
    createdByUserId: 'user_1',
    disabledAt: null,
    fireCount: 0,
    id: 'trg_1',
    instruction: 'Summarise the build.',
    kind: 'webhook',
    lastFiredAt: null,
    ownerAgentId: 'agent_1',
    ownerHandle: 'blippy',
    status: 'armed',
    title: 'Deploy finished',
    updatedAt: '2026-09-01T12:00:00.000Z',
    url: 'https://example.test/t/trg_1',
    version: 1,
};

test('no open drawer resolves to nothing', () => {
    expect(resolveTriggerSheetMode(null, [row])).toBeNull();
});

test('the create drawer needs no record to resolve against', () => {
    expect(resolveTriggerSheetMode({ kind: 'create' }, [])).toEqual({ kind: 'create' });
});

test('an open detail resolves to the row the section renders', () => {
    expect(resolveTriggerSheetMode({ kind: 'detail', triggerId: 'trg_1' }, [row])).toEqual({
        kind: 'detail',
        trigger: row,
    });
});

test('a detail whose row is gone closes rather than lingering on a stale record', () => {
    expect(resolveTriggerSheetMode({ kind: 'detail', triggerId: 'trg_1' }, [])).toBeNull();
});

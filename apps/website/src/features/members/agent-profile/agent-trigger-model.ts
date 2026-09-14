import {
    type Trigger,
    type TriggerFire,
    type TriggerKind,
    type TriggerStatus,
    triggerInstructionMaxBytes,
    triggerTitleMaxLength,
} from '@haus/api';
import { formatRelativeTime } from '../../../lib/format.ts';

/**
 * Armed reads as live, disabled as inert. Disabled is a resting state someone
 * chose, not a failure, so it stays neutral rather than borrowing `danger`.
 */
export function triggerStatusChip(status: TriggerStatus): {
    color: 'default' | 'success';
    label: string;
} {
    return status === 'armed'
        ? { color: 'success', label: 'Armed' }
        : { color: 'default', label: 'Disabled' };
}

export interface TriggerKindOption {
    description: string;
    kind: TriggerKind;
    label: string;
}

/**
 * Every kind a human can pick, in picker order. A second kind is a new entry
 * here and a new row in the picker — never a branch in the authoring flow.
 */
export const triggerKindOptions: readonly TriggerKindOption[] = [
    {
        description: 'An outside system POSTs to a private URL',
        kind: 'webhook',
        label: 'Webhook',
    },
];

export function triggerKindOption(kind: TriggerKind): TriggerKindOption {
    // The wire enum and this list are the same closed set, so a miss is a
    // programming error rather than a rendering case.
    const option = triggerKindOptions.find((candidate) => candidate.kind === kind);
    if (!option) {
        throw new Error(`Unknown trigger kind: ${kind}`);
    }
    return option;
}

export function triggerKindLabel(kind: TriggerKind) {
    return triggerKindOption(kind).label;
}

/**
 * Fire count and last-fired time are the same fact until a Trigger has fired:
 * "0 fires" adds nothing to "Never fired", so an unfired Trigger says it once.
 */
export function formatTriggerActivity(
    trigger: Pick<Trigger, 'fireCount' | 'lastFiredAt'>,
    now = Date.now()
) {
    if (trigger.fireCount === 0 || !trigger.lastFiredAt) {
        return 'Never fired';
    }

    const fires = trigger.fireCount === 1 ? '1 fire' : `${trigger.fireCount} fires`;
    return `Last fired ${formatRelativeTime(trigger.lastFiredAt, now)} · ${fires}`;
}

/** The one row line: what kind of stimulus wakes it, then how it has been used. */
export function formatTriggerRowDetail(
    trigger: Pick<Trigger, 'fireCount' | 'kind' | 'lastFiredAt'>,
    now = Date.now()
) {
    return `${triggerKindLabel(trigger.kind)} · ${formatTriggerActivity(trigger, now)}`;
}

/**
 * A human author is named by handle; an Agent-created Trigger has no creating
 * user, so it credits the Agent that owns it. The row says "Created by", so the
 * value is the author alone rather than a sentence that repeats its own label.
 */
export function triggerCreatorName(trigger: Pick<Trigger, 'createdByHandle'>, ownerName: string) {
    return trigger.createdByHandle ? `@${trigger.createdByHandle}` : ownerName;
}

/** Payload size reads in the unit a person would say it in. */
export function formatTriggerPayloadSize(bytes: number) {
    if (bytes < 1024) {
        return bytes === 1 ? '1 byte' : `${bytes} bytes`;
    }
    const kilobytes = bytes / 1024;
    return `${kilobytes >= 10 ? Math.round(kilobytes) : Math.round(kilobytes * 10) / 10} KB`;
}

export function formatTriggerFireTime(fire: Pick<TriggerFire, 'receivedAt'>) {
    return formatTriggerDate(fire.receivedAt);
}

export function formatTriggerHistoryTime(value: string) {
    return formatTriggerDate(value);
}

function formatTriggerDate(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

/**
 * One fire's supporting facts, skipping the ones the sender never supplied
 * rather than printing "none" three times.
 */
export function formatTriggerFireDetail(
    fire: Pick<TriggerFire, 'contentType' | 'dedupeKey' | 'payloadBytes'>
) {
    const parts = [formatTriggerPayloadSize(fire.payloadBytes)];
    if (fire.contentType) {
        parts.push(fire.contentType);
    }
    if (fire.dedupeKey) {
        parts.push(`key ${fire.dedupeKey}`);
    }
    return parts.join(' · ');
}

export interface TriggerDraft {
    instruction: string;
    kind: TriggerKind | null;
    title: string;
}

/** The instruction bound is a byte bound on the Server, so measure bytes. */
function byteLength(value: string) {
    return new TextEncoder().encode(value).length;
}

/**
 * Field issues are stated only once a value is actually wrong. An empty name
 * disables Create rather than shouting at someone who has not typed yet.
 */
export function triggerTitleIssue(title: string): string | null {
    return title.trim().length > triggerTitleMaxLength
        ? `Keep the name under ${triggerTitleMaxLength} characters.`
        : null;
}

export function triggerInstructionIssue(instruction: string): string | null {
    return byteLength(instruction.trim()) > triggerInstructionMaxBytes
        ? `Keep the instruction under ${triggerInstructionMaxBytes} bytes.`
        : null;
}

/** Create needs a name and a kind; the instruction is optional throughout. */
export function canCreateTrigger(draft: TriggerDraft) {
    return (
        draft.title.trim().length > 0 &&
        draft.kind !== null &&
        !triggerTitleIssue(draft.title) &&
        !triggerInstructionIssue(draft.instruction)
    );
}

export interface TriggerEditPatch {
    instruction?: string | null;
    title?: string;
}

/**
 * The edit form saves only what actually changed, and clearing the instruction
 * is `null` rather than an empty string. Returns `null` when nothing is dirty,
 * so "no patch" and "an empty patch" cannot both exist.
 */
export function triggerEditPatch(
    draft: Pick<TriggerDraft, 'instruction' | 'title'>,
    trigger: Pick<Trigger, 'instruction' | 'title'>
): TriggerEditPatch | null {
    const title = draft.title.trim();
    const instruction = draft.instruction.trim();
    const patch: TriggerEditPatch = {};

    if (title.length > 0 && title !== trigger.title) {
        patch.title = title;
    }
    if (instruction !== (trigger.instruction ?? '')) {
        patch.instruction = instruction.length > 0 ? instruction : null;
    }

    return Object.keys(patch).length > 0 ? patch : null;
}

export function canSaveTriggerEdit(
    draft: Pick<TriggerDraft, 'instruction' | 'title'>,
    trigger: Pick<Trigger, 'instruction' | 'title'>
) {
    return (
        draft.title.trim().length > 0 &&
        !triggerTitleIssue(draft.title) &&
        !triggerInstructionIssue(draft.instruction) &&
        triggerEditPatch(draft, trigger) !== null
    );
}

/** A disabled Trigger ignores its public URL, so a test fire has nothing to do. */
export function canTestTrigger(trigger: Pick<Trigger, 'status'>) {
    return trigger.status === 'armed';
}

/** Which Trigger drawer the section has open, as the section stores it. */
export type TriggerSheetState = { kind: 'create' } | { kind: 'detail'; triggerId: string };

/** The same drawer once its record has been resolved against the live list. */
export type TriggerSheetMode = { kind: 'create' } | { kind: 'detail'; trigger: Trigger };

/**
 * A detail drawer is open only while its row still exists, so a deleted
 * Trigger closes it without a second piece of state saying so — and the open
 * detail always renders the row the section renders.
 */
export function resolveTriggerSheetMode(
    state: TriggerSheetState | null,
    triggers: readonly Trigger[]
): TriggerSheetMode | null {
    if (!state) {
        return null;
    }
    if (state.kind === 'create') {
        return state;
    }
    const trigger = triggers.find((candidate) => candidate.id === state.triggerId);
    return trigger ? { kind: 'detail', trigger } : null;
}

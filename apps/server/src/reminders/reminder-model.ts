import { REMINDER_DESCRIPTION_MAX_CHARS, REMINDER_TITLE_MAX_CHARS } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, remindersTable } from '../postgres/schema.ts';
import type { parseReminderRepeat } from './cadence.ts';

export {
    agentCanAccessAnchor,
    ReminderAnchorAccessError,
    requireAgentAnchor,
} from './reminder-anchor-access.ts';

export interface ReminderClock {
    now(): Date;
}

export class ReminderFireError extends Error {
    readonly reminderId: string;

    constructor(reminderId: string, cause: unknown) {
        super('A reminder could not fire.', { cause });
        this.name = 'ReminderFireError';
        this.reminderId = reminderId;
    }
}

export interface Reminder {
    anchorChatId: string;
    anchorMessageId: string;
    createdAt: string;
    description: string | null;
    /** `--fail-after`: consecutive failures required before waking once. Null disables it. */
    failAfter: number | null;
    fireAt: string;
    hasScript: boolean;
    id: string;
    ownerAgentId: string;
    ownerHandle: string;
    repeat: string | null;
    scriptBytes: number;
    status: 'canceled' | 'fired' | 'scheduled';
    timezone: string;
    title: string;
    updatedAt: string;
    version: number;
    /** `--wake-on-change`: a repeated waking output counts as a quiet "unchanged" run. */
    wakeOnChange: boolean;
}

export interface ScheduleReminderInput {
    anchorChatId: string;
    anchorMessageId: string;
    commandId: string;
    description?: string | null;
    failAfter?: number | null;
    /** Optional only for calendar repeats, whose first fire the Server derives. */
    fireAt?: Date;
    repeat?: string | null;
    script?: string | null;
    serverId: string;
    timezone?: string;
    title: string;
    wakeOnChange?: boolean;
}

export class ReminderScheduleExpiredError extends Error {
    constructor() {
        super(
            'The requested fire time has passed. List reminders first; if no matching reminder exists, choose a future fire time and use a new command id.'
        );
        this.name = 'ReminderScheduleExpiredError';
    }
}

export class ReminderCommandConflictError extends Error {
    constructor() {
        super('That reminder command id was already used for different input.');
        this.name = 'ReminderCommandConflictError';
    }
}

export class ReminderAgentInactiveError extends Error {
    constructor() {
        super('The reminder author is not an active Agent in this Server.');
        this.name = 'ReminderAgentInactiveError';
    }
}

export async function requireActiveAgent(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    agentId: string
) {
    const [agent] = await db
        .select()
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                eq(agentsTable.id, agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        throw new ReminderAgentInactiveError();
    }
    return agent;
}

export async function readReminder(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    reminderId: string
) {
    const [row] = await db
        .select({ agent: agentsTable, reminder: remindersTable })
        .from(remindersTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, remindersTable.serverId),
                eq(agentsTable.id, remindersTable.ownerAgentId)
            )
        )
        .where(and(eq(remindersTable.serverId, serverId), eq(remindersTable.id, reminderId)))
        .limit(1);
    if (!row) {
        throw new Error('The scheduled reminder could not be read.');
    }
    return toReminder(row.reminder, row.agent.handle);
}

export function validateScheduleInput(
    input: ScheduleReminderInput,
    parsed: { repeat: ReturnType<typeof parseReminderRepeat> }
) {
    if (input.repeat && !parsed.repeat) {
        throw new Error('Reminder repeat does not use the supported grammar.');
    }
    const bytes = input.script == null ? 0 : Buffer.byteLength(input.script);
    if (input.script != null && (bytes < 1 || bytes > 16_384)) {
        throw new Error('Reminder script must be between 1 and 16384 UTF-8 bytes.');
    }
    validateFailAfter(input.failAfter);
}

export function validateFailAfter(failAfter: number | null | undefined) {
    if (failAfter != null && (!Number.isInteger(failAfter) || failAfter < 1 || failAfter > 20)) {
        throw new Error('Reminder --fail-after must be an integer between 1 and 20.');
    }
}

/**
 * A replayed `schedule` command matches its earlier fingerprint directly, or
 * one of the two retained fingerprints from before a write field this request
 * carries existed: the legacy one (no description, no explicit timezone) and
 * the pre-wake-rules one (no `failAfter`/`wakeOnChange`). Either still counts
 * as the same request when this one does not actually use the newer field.
 */
export function matchesEarlierScheduleFingerprint(
    existingFingerprint: string,
    input: ScheduleReminderInput,
    context: {
        description: string | null;
        legacyFingerprint: string;
        preWakeRulesFingerprint: string;
    }
): boolean {
    const matchesLegacy =
        input.timezone === undefined &&
        context.description === null &&
        existingFingerprint === context.legacyFingerprint;
    const matchesPreWakeRules =
        (input.failAfter ?? null) === null &&
        (input.wakeOnChange ?? false) === false &&
        existingFingerprint === context.preWakeRulesFingerprint;
    return matchesLegacy || matchesPreWakeRules;
}

/**
 * The title is the label a human reads on the cause line, so a write must keep
 * it short and on one line. The error teaches the format, because the Agent
 * reading it is the one who has to rewrite the title.
 */
export function validReminderTitle(raw: string): string {
    const title = raw.trim();
    if (title.length === 0) {
        throw new Error('Reminder title is required.');
    }
    if (title.length > REMINDER_TITLE_MAX_CHARS || /[\r\n]/u.test(title)) {
        throw new Error(
            `Reminder title must be one line of at most ${REMINDER_TITLE_MAX_CHARS} characters: a short label like a calendar invite subject, such as "Monday Advertising Review". Put the full instruction in --description.`
        );
    }
    return title;
}

export function validReminderDescription(raw: string): string {
    const description = raw.trim();
    if (description.length === 0 || description.length > REMINDER_DESCRIPTION_MAX_CHARS) {
        throw new Error(
            `Reminder description must be between 1 and ${REMINDER_DESCRIPTION_MAX_CHARS} characters.`
        );
    }
    return description;
}

export function toReminder(
    reminder: typeof remindersTable.$inferSelect,
    ownerHandle: string
): Reminder {
    return {
        anchorChatId: reminder.anchorChatId,
        anchorMessageId: reminder.anchorMessageId,
        createdAt: reminder.createdAt.toISOString(),
        description: reminder.description,
        failAfter: reminder.failAfter,
        fireAt: reminder.fireAt.toISOString(),
        hasScript: reminder.script !== null,
        id: reminder.id,
        ownerAgentId: reminder.ownerAgentId,
        ownerHandle,
        repeat: reminder.repeat,
        scriptBytes: reminder.script ? Buffer.byteLength(reminder.script) : 0,
        status: reminder.status,
        timezone: reminder.timezone,
        title: reminder.title,
        updatedAt: reminder.updatedAt.toISOString(),
        version: reminder.version,
        wakeOnChange: reminder.wakeOnChange,
    };
}

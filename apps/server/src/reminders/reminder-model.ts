import { REMINDER_DESCRIPTION_MAX_CHARS, REMINDER_TITLE_MAX_CHARS } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    chatMessagesTable,
    chatsTable,
    remindersTable,
} from '../postgres/schema.ts';
import type { parseReminderRepeat } from './cadence.ts';

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
}

export interface ScheduleReminderInput {
    anchorChatId: string;
    anchorMessageId: string;
    commandId: string;
    description?: string | null;
    /** Optional only for calendar repeats, whose first fire the Server derives. */
    fireAt?: Date;
    repeat?: string | null;
    script?: string | null;
    serverId: string;
    timezone?: string;
    title: string;
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

export class ReminderAnchorAccessError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReminderAnchorAccessError';
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

/**
 * The Agent can still reach where its automation lands. `anchorMessageId` is
 * null when the anchor is the Chat itself — a human wires a Trigger from the
 * Automations drawer with no asking message to point at — and then Chat access
 * is the whole check.
 */
export async function requireAgentAnchor(
    db: Pick<HausDatabase, 'select'>,
    input: {
        agentId: string;
        anchorChatId: string;
        anchorMessageId: string | null;
        serverId: string;
    }
) {
    const anchor = input.anchorMessageId
        ? await readMessageAnchor(db, { ...input, anchorMessageId: input.anchorMessageId })
        : await readChatAnchor(db, input);
    const accessChatId = anchor?.chatKind === 'thread' ? anchor.parentChatId : input.anchorChatId;
    if (!(anchor && accessChatId)) {
        throw new ReminderAnchorAccessError('The reminder anchor is not a message in this Server.');
    }
    if (anchor.chatKind === 'dm' && anchor.dmAgentId === input.agentId) {
        return anchor;
    }
    const [access] = await db
        .select({ agentId: channelAgentParticipantsTable.agentId })
        .from(channelAgentParticipantsTable)
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, input.serverId),
                eq(channelAgentParticipantsTable.chatId, accessChatId),
                eq(channelAgentParticipantsTable.agentId, input.agentId)
            )
        )
        .limit(1);
    if (!access) {
        throw new ReminderAnchorAccessError('The reminder author cannot access the anchor Chat.');
    }
    return anchor;
}

async function readMessageAnchor(
    db: Pick<HausDatabase, 'select'>,
    input: { anchorChatId: string; anchorMessageId: string; serverId: string }
) {
    const [anchor] = await db
        .select({
            chatKind: chatsTable.kind,
            dmAgentId: chatsTable.dmAgentId,
            messageId: chatMessagesTable.id,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatMessagesTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, chatMessagesTable.serverId),
                eq(chatsTable.id, chatMessagesTable.chatId)
            )
        )
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.anchorChatId),
                eq(chatMessagesTable.id, input.anchorMessageId)
            )
        )
        .limit(1);
    return anchor ?? null;
}

async function readChatAnchor(
    db: Pick<HausDatabase, 'select'>,
    input: { anchorChatId: string; serverId: string }
) {
    const [anchor] = await db
        .select({
            chatKind: chatsTable.kind,
            dmAgentId: chatsTable.dmAgentId,
            messageId: chatsTable.id,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.anchorChatId)))
        .limit(1);
    return anchor ?? null;
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
    };
}

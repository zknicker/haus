import type { SQL } from 'bun';

/**
 * Structural facts the Thread → inline-reply migration must leave true. Each
 * is a count of violations, read the same way before and after, so a value
 * that was already non-zero before the migration shows up in the "before"
 * report rather than being blamed on it.
 */
export interface Structure {
    counts: {
        /** Adjacent Messages (by sequence) whose `created_at` goes backwards. */
        createdAtInversions: number;
        /** Rows whose (Chat, Message) pair names a Message in another Chat. */
        mismatchedPairs: number;
        messages: number;
        /** Inline replies whose parent or root is not in the same Chat. */
        repliesOutsideChat: number;
        /** Inline replies sequenced at or before the Message they answer. */
        repliesBeforeParent: number;
        /** Chats whose sequences are not exactly 1..n. */
        sparseChats: number;
        /** Chats whose `last_message_sequence` is not their newest sequence. */
        staleLastSequence: number;
        threadChats: number;
    };
    /** Rows naming a Chat id that no `chats` row has, by `table.column`. */
    missingChats: Record<string, number>;
    /** Rows naming a Message id that no `chat_messages` row has, by `table.column`. */
    missingMessages: Record<string, number>;
}

export interface InvariantResult {
    detail: string;
    name: string;
    ok: boolean;
}

/** (table, Chat column, Message column) pairs whose Message must sit in that Chat. */
const pairs = [
    ['attachments', 'chat_id', 'message_id'],
    ['cloud_agent_work_links', 'chat_id', 'message_id'],
    ['image_generation_links', 'chat_id', 'message_id'],
    ['agent_inbox_exact_visibility', 'chat_id', 'message_id'],
    ['agent_message_drafts', 'chat_id', 'reply_to_message_id'],
    ['triggers', 'anchor_chat_id', 'anchor_message_id'],
    ['chats', 'parent_chat_id', 'anchor_message_id'],
] as const;

export async function readStructure(database: SQL): Promise<Structure> {
    const [counts] = (await database`
        SELECT
            (SELECT count(*)::integer FROM chat_messages) AS messages,
            (SELECT count(*)::integer FROM chats WHERE kind = 'thread') AS "threadChats",
            (SELECT count(*)::integer FROM (
                SELECT 1 FROM chat_messages GROUP BY server_id, chat_id
                HAVING count(*) <> max(sequence) OR min(sequence) <> 1
                    OR count(DISTINCT sequence) <> count(*)
            ) sparse) AS "sparseChats",
            (SELECT count(*)::integer FROM (
                SELECT created_at < lag(created_at) OVER (
                    PARTITION BY server_id, chat_id ORDER BY sequence
                ) AS inverted FROM chat_messages
            ) ordered WHERE inverted) AS "createdAtInversions",
            (SELECT count(*)::integer FROM chats chat
                WHERE chat.last_message_sequence <> coalesce((
                    SELECT max(message.sequence) FROM chat_messages message
                    WHERE message.server_id = chat.server_id AND message.chat_id = chat.id
                ), 0)) AS "staleLastSequence",
            (SELECT count(*)::integer FROM chat_messages reply
                WHERE (reply.reply_to_message_id IS NOT NULL AND NOT EXISTS (
                        SELECT 1 FROM chat_messages parent
                        WHERE parent.server_id = reply.server_id AND parent.chat_id = reply.chat_id
                            AND parent.id = reply.reply_to_message_id))
                    OR (reply.reply_root_message_id IS NOT NULL AND NOT EXISTS (
                        SELECT 1 FROM chat_messages root
                        WHERE root.server_id = reply.server_id AND root.chat_id = reply.chat_id
                            AND root.id = reply.reply_root_message_id))) AS "repliesOutsideChat",
            (SELECT count(*)::integer FROM chat_messages reply
                JOIN chat_messages parent
                    ON parent.server_id = reply.server_id AND parent.chat_id = reply.chat_id
                    AND parent.id = reply.reply_to_message_id
                WHERE parent.sequence >= reply.sequence) AS "repliesBeforeParent"
    `) as [Omit<Structure['counts'], 'mismatchedPairs'>];
    let mismatchedPairs = 0;
    for (const [table, chatColumn, messageColumn] of pairs) {
        const [row] = (await database.unsafe(`
            SELECT count(*)::integer AS count FROM "${table}" t
            JOIN chat_messages message ON message.server_id = t.server_id AND message.id = t."${messageColumn}"
            WHERE message.chat_id <> t."${chatColumn}"`)) as [{ count: number }];
        mismatchedPairs += row.count;
    }
    return {
        counts: { ...counts, mismatchedPairs },
        missingChats: await countMissing(database, 'chat_id', 'chats'),
        missingMessages: await countMissing(database, 'message_id', 'chat_messages'),
    };
}

/**
 * Judges the current structure: the Message count must match the snapshot,
 * no Thread may remain, and every other violation count must be zero or no
 * worse than it was before the migration.
 */
export function judgeStructure(after: Structure, before?: Structure): InvariantResult[] {
    const results: InvariantResult[] = [
        {
            detail: before
                ? `${before.counts.messages} → ${after.counts.messages}`
                : `${after.counts.messages}`,
            name: 'total message count unchanged',
            ok: before ? before.counts.messages === after.counts.messages : true,
        },
        {
            detail: `${after.counts.threadChats}`,
            name: 'zero thread chats',
            ok: after.counts.threadChats === 0,
        },
    ];
    const judged = [
        ['sparseChats', 'per chat sequences dense and unique'],
        ['createdAtInversions', 'sequences in created_at order'],
        ['staleLastSequence', 'last_message_sequence equals max sequence'],
        ['repliesOutsideChat', 'reply_to/reply_root resolve within the same chat'],
        ['repliesBeforeParent', 'replies sequenced after their parent'],
        ['mismatchedPairs', '(chat, message) pairs name a message in that chat'],
    ] as const;
    for (const [key, name] of judged) {
        results.push(noWorse(name, after.counts[key], before?.counts[key]));
    }
    for (const [label, map, baseline] of [
        ['missing chat', after.missingChats, before?.missingChats],
        ['missing message', after.missingMessages, before?.missingMessages],
    ] as const) {
        for (const [column, value] of Object.entries(map)) {
            results.push(noWorse(`no ${label} in ${column}`, value, baseline?.[column]));
        }
    }
    return results;
}

function noWorse(name: string, value: number, baseline: number | undefined): InvariantResult {
    return {
        detail: baseline === undefined ? `${value}` : `${baseline} → ${value}`,
        name,
        ok: value === 0 || (baseline !== undefined && value <= baseline),
    };
}

/** Counts dangling ids in every public text column ending in `suffix`, outside the audit tables. */
async function countMissing(database: SQL, suffix: string, target: 'chats' | 'chat_messages') {
    const columns = (await database`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'text'
            AND column_name LIKE ${`%${suffix}`}
            AND table_name NOT LIKE 'thread_migration_%'
        ORDER BY 1, 2`) as { column_name: string; table_name: string }[];
    const missing: Record<string, number> = {};
    for (const { column_name: column, table_name: table } of columns) {
        const [row] = (await database.unsafe(`
            SELECT count(*)::integer AS count FROM "${table}" t
            WHERE t."${column}" IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM "${target}" target WHERE target.id = t."${column}")`)) as [
            { count: number },
        ];
        missing[`${table}.${column}`] = row.count;
    }
    return missing;
}

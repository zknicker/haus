import type { AgentDreamFile, HeartbeatMark } from '@haus/api';
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDreamSummariesTable, agentDreamsTable, remindersTable } from '../postgres/schema.ts';

type DreamFacts = NonNullable<HeartbeatMark['dream']>;

export interface DreamRunWindow {
    agentId: string;
    /** When the dream settled; null leaves the Computer's own record to say. */
    endedAt: Date | null;
    runId: string;
    startedAt: Date;
}

const followUpScanLimit = 500;
const followUpsPerDream = 20;
const standingPreferences = 'Standing Preferences';

/**
 * What each settled dream changed and wrote down: file stats and the Standing
 * Preferences it added from `agent_dreams`, the Agent's own summary line, and the
 * reminders it scheduled while it ran. Three bounded reads for the whole window,
 * however many Agents dreamed. `rulesLearned` is per dream, for the summary.
 */
export async function readDreamFacts(
    db: HausDatabase,
    serverId: string,
    dreams: readonly DreamRunWindow[]
): Promise<Map<string, { facts: DreamFacts; rulesLearned: number }>> {
    const facts = new Map<string, { facts: DreamFacts; rulesLearned: number }>();
    if (dreams.length === 0) {
        return facts;
    }
    const runIds = dreams.map((dream) => dream.runId);
    const [records, summaries, reminders] = await Promise.all([
        db
            .select({
                files: agentDreamsTable.files,
                finishedAt: agentDreamsTable.finishedAt,
                patch: agentDreamsTable.patch,
                runId: agentDreamsTable.runId,
            })
            .from(agentDreamsTable)
            .where(
                and(
                    eq(agentDreamsTable.serverId, serverId),
                    inArray(agentDreamsTable.runId, runIds)
                )
            ),
        db
            .select({
                runId: agentDreamSummariesTable.runId,
                summary: agentDreamSummariesTable.summary,
            })
            .from(agentDreamSummariesTable)
            .where(
                and(
                    eq(agentDreamSummariesTable.serverId, serverId),
                    inArray(agentDreamSummariesTable.runId, runIds)
                )
            ),
        readReminders(db, serverId, dreams),
    ]);
    const recordOf = new Map(records.map((record) => [record.runId, record]));
    const summaryOf = new Map(summaries.map((row) => [row.runId, row.summary]));
    for (const dream of dreams) {
        const record = recordOf.get(dream.runId);
        const finishedAt = record?.finishedAt ?? dream.endedAt;
        const followUps = reminders
            .filter(
                (reminder) =>
                    reminder.ownerAgentId === dream.agentId &&
                    reminder.createdAt >= dream.startedAt &&
                    finishedAt !== null &&
                    reminder.createdAt <= finishedAt
            )
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
        const summary = summaryOf.get(dream.runId)?.trim() || null;
        facts.set(dream.runId, {
            facts: {
                added: sum(record?.files ?? [], 'added'),
                followUpTitles: followUps
                    .slice(0, followUpsPerDream)
                    .map((reminder) => reminder.title),
                followUps: Math.min(followUps.length, followUpsPerDream),
                removed: sum(record?.files ?? [], 'removed'),
                summary,
                summaryLine: firstSummaryLine(summary),
            },
            rulesLearned: record ? countStandingPreferencesAdded(record.patch) : 0,
        });
    }
    return facts;
}

/**
 * The non-blank lines a dream added under `## Standing Preferences` in MEMORY.md.
 * Hunk headers name the section the hunk opens in and `## ` lines move it, as the
 * App's dream model reads the same patch. A reworded rule counts as one added
 * line, so this overstates a pure rewrite; it is the count of lines now standing.
 */
export function countStandingPreferencesAdded(patch: string): number {
    let inMemory = false;
    let inHunk = false;
    let section = '';
    let added = 0;
    for (const line of patch.split('\n')) {
        if (line.startsWith('diff --git a/')) {
            inMemory = line === 'diff --git a/MEMORY.md b/MEMORY.md';
            inHunk = false;
            continue;
        }
        const header = /^@@ [^@]+ @@(?: ## (.+))?$/u.exec(line);
        if (header) {
            inHunk = true;
            section = header[1]?.trim() ?? '';
            continue;
        }
        if (!(inMemory && inHunk)) {
            continue;
        }
        const text = line.slice(1);
        if (text.startsWith('## ')) {
            section = text.slice(3).trim();
        } else if (line.startsWith('+') && section === standingPreferences && text.trim() !== '') {
            added += 1;
        }
    }
    return added;
}

function readReminders(db: HausDatabase, serverId: string, dreams: readonly DreamRunWindow[]) {
    const earliest = Math.min(...dreams.map((dream) => dream.startedAt.getTime()));
    const latest = Math.max(
        ...dreams.map((dream) => (dream.endedAt ?? dream.startedAt).getTime()),
        earliest
    );
    return db
        .select({
            createdAt: remindersTable.createdAt,
            ownerAgentId: remindersTable.ownerAgentId,
            title: remindersTable.title,
        })
        .from(remindersTable)
        .where(
            and(
                eq(remindersTable.serverId, serverId),
                inArray(remindersTable.ownerAgentId, [
                    ...new Set(dreams.map((dream) => dream.agentId)),
                ]),
                ne(remindersTable.status, 'canceled'),
                gte(remindersTable.createdAt, new Date(earliest)),
                // A dream's record can finish a little after its turn did.
                lte(remindersTable.createdAt, new Date(latest + 60 * 60 * 1000))
            )
        )
        .limit(followUpScanLimit);
}

function sum(files: readonly AgentDreamFile[], key: 'added' | 'removed'): number {
    return files.reduce((total, file) => total + file[key], 0);
}

/** First non-empty line of the summary, with a leading bullet dash removed. */
function firstSummaryLine(summary: string | null): string | null {
    const line = summary
        ?.split('\n')
        .map((text) => text.trim())
        .find((text) => text !== '');
    return line ? line.replace(/^-\s+/u, '') || null : null;
}

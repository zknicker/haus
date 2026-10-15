// Reads one scenario run's saved evidence: the runner transcript, the routing
// evidence a scenario captured (chats, Threads, journals), the `--done` sends
// those journals carry, and a display timeline for the report.

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { classifyPlacement, parseDoneSends } from '../agent-tests/placement.mjs';
import { slug } from '../agent-tests/report.mjs';

export const runsDirectory = '.context/agent-tests';

/** `{ transcript, evidence }` for one scenario in one run; either may be null. */
export async function readScenarioRun(root, stamp, name) {
    const runsDir = path.join(path.resolve(root), runsDirectory);
    const transcriptFile = path.join(runsDir, stamp, slug(name), 'transcript.json');
    const transcript = existsSync(transcriptFile)
        ? JSON.parse(await readFile(transcriptFile, 'utf8'))
        : null;
    const evidence = transcript
        ? await findEvidence(name, transcript, path.join(runsDir, 'evidence'))
        : null;
    return { evidence, transcript };
}

/**
 * The routing evidence whose chats include the transcript's first chat. Evidence
 * stamps are the harness's clock, not the run stamp, so the match is by chat id.
 */
export async function findEvidence(name, transcript, evidenceDir) {
    const rootChatId = transcript.chats?.[0]?.id;
    if (!rootChatId) {
        return null;
    }
    const stamps = (await readdir(evidenceDir).catch(() => [])).sort().reverse();
    for (const stamp of stamps) {
        const file = path.join(evidenceDir, stamp, `${name}.json`);
        if (!existsSync(file)) {
            continue;
        }
        const evidence = JSON.parse(await readFile(file, 'utf8'));
        if (evidence.chats.some((chat) => chat.chatId === rootChatId)) {
            return { ...evidence, agentId: evidence.diagnostics?.[0]?.agentId, rootChatId };
        }
    }
    return null;
}

/** `--done` sends from the journals the evidence captured; unavailable journals add none. */
export function doneSendsFrom(journals) {
    return parseDoneSends(
        journals
            .filter((entry) => entry.evidence?.status === 'available')
            .flatMap((entry) => entry.evidence.journal.tools)
            .map((tool) => tool.input?.command)
            .filter((command) => typeof command === 'string')
    );
}

/** Every message across the evidence chats, deduplicated and in time order. */
export function evidenceMessages(evidence) {
    const all = evidence.chats.flatMap((chat) => chat.messages);
    return [...new Map(all.map((message) => [message.id, message])).values()].sort(byTime);
}

/** Whether a post's body is one the turn sent with `--done`. */
export function sentWithDone(content, doneSends) {
    const body = content.trim();
    return body !== '' && doneSends.some((send) => send.body.trim() === body);
}

/**
 * The run as the report shows it: every message in the channel and its Threads.
 * Agent posts carry a placement label and whether they went out with `--done`.
 * Without routing evidence, the transcript's observed messages stand in, unlabeled.
 */
export function buildTimeline({ evidence, transcript }, { labels = new Map() } = {}) {
    if (evidence) {
        const { agentId, rootChatId } = evidence;
        const messages = evidenceMessages(evidence);
        const doneSends = doneSendsFrom(evidence.journals ?? []);
        const context = {
            channelId: rootChatId,
            ownAnchors: messages.filter((m) => isOwn(m, agentId)).map((m) => m.id),
            requestId: messages.filter((m) => m.author.kind === 'human').map((m) => m.id),
            threads: evidence.chats.flatMap((chat) => chat.threads ?? []),
        };
        return messages.map((message) => {
            const entry = baseEntry(message, rootChatId);
            if (message.author.kind !== 'agent') {
                return entry;
            }
            if (message.runId?.startsWith('run_agenttests_')) {
                return { ...entry, who: 'seeded' };
            }
            if (!isOwn(message, agentId)) {
                return { ...entry, who: 'peer' };
            }
            return {
                ...entry,
                finished: sentWithDone(message.content, doneSends),
                label: labels.get(message.id) ?? classifyPlacement(message, context),
            };
        });
    }
    const rootChatId = transcript?.chats?.[0]?.id;
    return (transcript?.messages ?? [])
        .slice()
        .sort(byTime)
        .map((message) => baseEntry(message, rootChatId));
}

function baseEntry(message, rootChatId) {
    return {
        content: message.content,
        id: message.id,
        reactions: (message.reactions ?? []).map((reaction) => reaction.emoji),
        where: message.chatId === rootChatId ? 'channel' : 'thread',
        who: message.author.kind === 'human' ? 'human' : 'agent',
    };
}

function isOwn(message, agentId) {
    return message.author.kind === 'agent' && message.author.agentId === agentId;
}

export function byTime(left, right) {
    return Date.parse(left.createdAt) - Date.parse(right.createdAt);
}

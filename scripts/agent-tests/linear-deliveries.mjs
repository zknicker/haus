// What Linear and an Agent do to a seeded Linear world (linear-world.mjs):
// author a `linear` Trigger through the Agent route, as `haus trigger create`
// would, and POST an Issue state change to the Server's Haus app webhook,
// signed with the stack's own HAUS_LINEAR_APP_WEBHOOK_SECRET the way Linear
// signs it (specs/linear-app.md#webhooks). The body is the captured
// `issue-update-state` delivery re-pointed at the seeded workspace.

import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createAgentAuthor } from './author.mjs';

const capturedIssueUpdate = 'apps/server/test/fixtures/linear/captured/issue-update-state.json';

/** Creates a `linear` Trigger as the Agent, anchored on `messageId` in `chatId`. */
export async function createAgentLinearTrigger(
    kit,
    { agentId, chatId, groups, messageId, ...rest }
) {
    const author = createAgentAuthor({
        repositoryRoot: process.cwd(),
        serverId: kit.serverId,
        serverUrl: kit.harness.serverUrl,
        stamp: kit.stamp,
    });
    const token = await author.mint(agentId, chatId);
    const response = await fetch(`${kit.harness.serverUrl}/api/agent/triggers`, {
        body: JSON.stringify({ ...rest, kind: 'linear', linear: { groups }, messageId }),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(
            `Agent linear Trigger create failed (${response.status}): ${JSON.stringify(payload)?.slice(0, 300)}`
        );
    }
    return payload;
}

/** The captured Issue update, moved from `from` to `to` on a DES issue by a human. */
export async function issueStateChange(world, { from, identifier, title, to }) {
    const captured = JSON.parse(
        await readFile(path.join(process.cwd(), capturedIssueUpdate), 'utf8')
    ).body;
    const team = world.teams.des;
    const url = `https://linear.app/${world.urlKey}/issue/${identifier}/${slug(title)}`;
    const now = new Date();
    const { botActor: _botActor, ...data } = captured.data;
    return {
        ...captured,
        actor: {
            email: world.people.maya.email,
            id: world.people.maya.id,
            name: world.people.maya.name,
            type: 'user',
            url: `https://linear.app/${world.urlKey}/profiles/maya`,
        },
        createdAt: now.toISOString(),
        data: {
            ...data,
            id: crypto.randomUUID(),
            identifier,
            number: Number(identifier.split('-')[1]),
            state: { color: '#f2994a', id: to.id, name: to.name, type: to.type },
            stateId: to.id,
            team: { id: team.id, key: team.key, name: team.name },
            teamId: team.id,
            title,
            updatedAt: now.toISOString(),
            url,
        },
        organizationId: world.organizationId,
        updatedFrom: { ...captured.updatedFrom, stateId: from.id, updatedAt: now.toISOString() },
        url,
        webhookId: crypto.randomUUID(),
        webhookTimestamp: now.getTime(),
    };
}

/** POSTs one delivery to `/api/linear/webhook` the way Linear does. */
export async function postLinearDelivery(kit, world, payload) {
    const body = JSON.stringify(payload);
    const deliveryId = crypto.randomUUID();
    const response = await fetch(`${kit.harness.serverUrl}/api/linear/webhook`, {
        body,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'linear-delivery': deliveryId,
            'linear-event': payload.type,
            'linear-signature': createHmac('sha256', world.webhookSecret)
                .update(body)
                .digest('hex'),
            'linear-timestamp': String(payload.webhookTimestamp),
        },
        method: 'POST',
    });
    return { body: await response.json().catch(() => null), deliveryId, status: response.status };
}

/**
 * The settled turn's execution journals. Journals sync asynchronously, so an
 * unavailable one is retried; an unreadable one throws rather than letting a
 * gate pass on an empty journal.
 */
export async function turnJournals(kit, agentId, turn, { attempts = 10, delayMs = 3000 } = {}) {
    const journals = [];
    for (const runId of turn.runIds ?? [turn.runId]) {
        let result = null;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            result = await kit.trpc('agent.executionJournal', {
                agentId,
                runId,
                serverId: kit.serverId,
            });
            if (result.status === 'available') {
                break;
            }
            await wait(delayMs);
        }
        if (result?.status !== 'available') {
            throw new Error(
                `Execution journal for run ${runId} stayed ${result?.status ?? 'unreadable'} after ${attempts} tries.`
            );
        }
        journals.push(result.journal);
    }
    return journals;
}

/** Every shell command the journals ran. */
export function journalCommands(journals) {
    return journals.flatMap((journal) =>
        journal.tools.map((tool) => String(tool.input?.command ?? ''))
    );
}

/** Everything the worker wrote in `chatIds` and their Threads. */
export async function agentWrites(kit, agentId, chatIds) {
    const written = [];
    for (const chatId of chatIds) {
        const page = await kit.trpc('chat.messages', {
            chatId,
            limit: 100,
            serverId: kit.serverId,
        });
        written.push(...kit.authoredBy(page.messages, agentId));
        for (const thread of page.threads ?? []) {
            await kit.trackChat(thread.threadChatId);
            written.push(...kit.authoredBy(await kit.readMessages(thread.threadChatId), agentId));
        }
    }
    return written;
}

/** Which of `secrets` appear anywhere in `texts`. */
export function leakedSecrets(secrets, texts) {
    return secrets.filter((secret) => texts.some((text) => text.includes(secret)));
}

export function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function slug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
}

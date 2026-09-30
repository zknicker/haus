// Seeding durable messages authored by another Agent, through the same public
// runner contract the Computer uses at launch: prove the dev Computer's
// credential, mint a scoped runner token, then post to the Agent API with the
// product target grammar ('#channel', '#channel:<anchor>', 'dm:@operator').

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDevStackStatePaths } from '../dev-stack-shared.mjs';

export function createAgentAuthor({ repositoryRoot = process.cwd(), serverId, serverUrl, stamp }) {
    let credentialHashPromise = null;
    const runnerTokens = new Map();

    function credentialHash() {
        credentialHashPromise ??= readComputerCredentialHash({ repositoryRoot, serverId });
        return credentialHashPromise;
    }

    async function mint(agentId, chatId) {
        const cacheKey = `${agentId}\0${chatId}`;
        const cached = runnerTokens.get(cacheKey);
        if (cached) {
            return cached;
        }
        const response = await fetch(`${serverUrl}/computer/runner/mint`, {
            body: JSON.stringify({
                agentId,
                chatId,
                credentialHash: await credentialHash(),
                runId: `run_agenttests_${stamp}`,
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        const payload = await response.json().catch(() => null);
        if (!(response.ok && payload?.runnerToken)) {
            throw new Error(
                `Could not mint a runner for Agent ${agentId} (${response.status}): ${JSON.stringify(payload)?.slice(0, 300)}`
            );
        }
        runnerTokens.set(cacheKey, payload.runnerToken);
        return payload.runnerToken;
    }

    /**
     * Authors one durable message as `agentId`. A 'held' result means the Agent
     * has unseen context; the send is retried once as a draft send, which is
     * exactly what a real Agent does after reading the held context.
     */
    async function authorAsAgent(agentId, target, content, { chatId, nonce } = {}) {
        if (!chatId) {
            throw new Error(
                'authorAsAgent needs a chatId for the runner mint; pass { chatId } or register the chat with the kit first.'
            );
        }
        const token = await mint(agentId, chatId);
        const messageNonce = nonce ?? `agenttests_${stamp}_${crypto.randomUUID()}`;
        const holds = [];
        for (const body of agentSendAttempts({ content, nonce: messageNonce, target })) {
            const result = await send(token, body);
            if (result.state === 'sent') {
                return result;
            }
            holds.push(result);
        }
        throw new Error(
            `Agent ${agentId} could not author into ${target}: the Server held the send twice (${describeHolds(holds)}). The Agent has unseen context that a real turn would have to read first.`
        );
    }

    async function send(token, body) {
        const response = await fetch(`${serverUrl}/api/agent/messages/send`, {
            body: JSON.stringify(body),
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            method: 'POST',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(
                `Agent message send to ${body.target} failed (${response.status}): ${JSON.stringify(payload)?.slice(0, 300)}`
            );
        }
        return payload ?? { state: 'unknown' };
    }

    return { authorAsAgent, credentialHash, mint };
}

/**
 * The two sends `authorAsAgent` makes: the message itself, then — after a hold
 * saved it as the Agent's draft — a draft send, which carries no content.
 */
export function agentSendAttempts({ content, nonce, target }) {
    return [
        { content, nonce, sendDraft: false, target },
        { nonce, sendDraft: true, target },
    ];
}

/** The dev Computer writes its credential beside its attachment for this Server. */
export async function readComputerCredentialHash({ repositoryRoot, serverId }) {
    const file = computerAttachmentPath({ repositoryRoot, serverId });
    let attachment;
    try {
        attachment = JSON.parse(await readFile(file, 'utf8'));
    } catch (cause) {
        throw new Error(
            `Could not read the dev Computer attachment at ${file}. Start the dev stack (bun run dev) so the Computer attaches to Server ${serverId}.`,
            { cause }
        );
    }
    if (typeof attachment?.credential !== 'string') {
        throw new Error(`The dev Computer attachment at ${file} has no credential.`);
    }
    return createHash('sha256').update(attachment.credential).digest('hex');
}

export function computerAttachmentPath({ repositoryRoot, serverId }) {
    const statePaths = createDevStackStatePaths({ baseEnvironment: process.env, repositoryRoot });
    return path.join(statePaths.computerDataRoot, 'servers', serverId, 'attachment.json');
}

/** Builds the thread target grammar for an anchor message id. */
export function threadTarget(channelName, anchorMessageId) {
    return `#${channelName}:${anchorMessageId.replace(/^msg_/u, '').slice(0, 8)}`;
}

function describeHolds(holds) {
    return holds
        .map(
            (hold) =>
                `newMessageCount=${hold.newMessageCount ?? '?'} reholdCount=${hold.reholdCount ?? '?'}`
        )
        .join('; ');
}

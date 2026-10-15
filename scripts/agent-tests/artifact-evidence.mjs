// Shared evidence readers for the shared-artifact scenarios: what an Agent
// published, what it wrote in chat, and which shell commands its turn ran.

/** Live shared artifacts the Agent created, newest first. */
export async function artifactsCreatedBy(kit, agentId) {
    const listed = await kit.trpc('artifact.list', {
        serverId: kit.serverId,
        creator: { type: 'agent', agent_id: agentId },
    });
    return listed.artifacts;
}

/** The Agent's messages after `sinceSequence` in the chat, plus any Thread opened there. */
export async function agentMessages(kit, agentId, chatId, sinceSequence) {
    const page = await kit.trpc('chat.messages', { chatId, limit: 100, serverId: kit.serverId });
    const own = (message) => message.author.kind === 'agent' && message.author.agentId === agentId;
    const collected = page.messages.filter(
        (message) => own(message) && message.sequence > sinceSequence
    );
    for (const thread of page.threads ?? []) {
        collected.push(...(await kit.readMessages(thread.threadChatId)).filter(own));
    }
    return collected;
}

/** Shell commands the settled turn ran, from its Computer execution journal. */
export async function turnCommands(kit, agentId, turn) {
    const result = await kit.trpc('agent.executionJournal', {
        agentId,
        runId: turn.runId,
        serverId: kit.serverId,
    });
    if (result.status !== 'available') {
        return [];
    }
    return result.journal.tools
        .map((tool) => tool.input?.command)
        .filter((command) => typeof command === 'string');
}

/**
 * Publishes a shared file as the signed-in human member through the App's raw
 * write path (`PUT /artifacts/:serverId/publish`), replacing any leftover at
 * the same path. Needs enabled development artifact storage.
 */
export async function publishArtifactAsMember(kit, { content, path, title }) {
    const query = new URLSearchParams({
        content_type: 'text/markdown',
        path,
        replace: 'true',
        request_id: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
        ...(title ? { title } : {}),
    });
    const response = await fetch(
        `${kit.harness.serverUrl}/artifacts/${kit.serverId}/publish?${query}`,
        {
            body: content,
            headers: {
                authorization: `Bearer ${await kit.harness.memberToken()}`,
                'content-type': 'application/octet-stream',
            },
            method: 'PUT',
        }
    );
    const payload = await response.json().catch(() => null);
    if (!(response.ok && payload?.artifact)) {
        throw new Error(
            `Publishing ${path} as the member failed (${response.status}): ${JSON.stringify(payload)?.slice(0, 300)}`
        );
    }
    return payload.artifact;
}

/** Best-effort cleanup for artifacts a scenario caused. */
export async function deleteArtifacts(kit, artifacts) {
    for (const artifact of artifacts) {
        await kit.trpc('artifact.delete', {
            serverId: kit.serverId,
            artifact_id: artifact.artifact_id,
        });
    }
}

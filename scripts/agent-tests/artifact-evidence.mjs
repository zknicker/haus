// Shared evidence readers for the shared-artifact scenarios: what an Agent
// published and what it wrote in chat.

/** Live shared artifacts the Agent created in any folder, newest first. */
export async function artifactsCreatedBy(kit, agentId) {
    const listed = await kit.trpc('artifact.list', {
        serverId: kit.serverId,
        creator: { type: 'agent', agent_id: agentId },
        // Drive lists one folder level by default; every Agent file sits inside an area folder.
        recursive: true,
    });
    return listed.artifacts;
}

export async function agentMessages(kit, agentId, chatId, sinceSequence) {
    const page = await kit.trpc('chat.messages', { chatId, limit: 100, serverId: kit.serverId });
    const own = (message) => message.author.kind === 'agent' && message.author.agentId === agentId;
    return page.messages.filter((message) => own(message) && message.sequence > sinceSequence);
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

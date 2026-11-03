import { expect, test } from 'bun:test';
import { formatImageGenerationLink } from '@haus/api';
import { readTargetAsAgent } from './agent-read-target.ts';
import type { HausClient } from './haus-client.ts';
import { imageGenerationFixture } from './image-generation-fixture.ts';

const fixture = imageGenerationFixture();

test('a ready generated image loads exactly where its generation is visible', async () => {
    const { channelId, harness, orbitAgentId, owner, peer, serverId } = fixture;
    await owner.trpc.imageGenerationSettings.setKey.mutate({
        apiKey: 'sk-image-secret-key-1234',
        provider: 'openai',
        serverId,
    });
    const novaAgentId = (
        await owner.trpc.agent.create.mutate({
            computerId: (
                (await harness.sql`select computer_id from agents where id = ${orbitAgentId}`) as {
                    computer_id: string;
                }[]
            )[0].computer_id,
            displayName: 'Nova',
            handle: 'nova',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId,
        })
    ).agent.id;
    const sharedId = (
        await owner.trpc.chat.createChannel.mutate({
            agentIds: [orbitAgentId, novaAgentId],
            name: 'shared',
            serverId,
        })
    ).id;

    const orbit = await fixture.mintRunner('run_img_vis_orbit');
    const nova = await fixture.mintRunner('run_img_vis_nova', {
        agentId: novaAgentId,
        chatId: sharedId,
    });
    const created = await fixture.create(orbit, { nonce: 'vis-1' });
    const generationId = created.body.generation.id as string;
    const ready = await fixture.settled(orbit, generationId);
    if (ready.result.state !== 'ready') {
        throw new Error('not ready');
    }
    const { attachmentId } = ready.result;

    // The requesting Agent always loads its own image; nobody else can before a link.
    expect((await agentView(orbit, attachmentId)).status).toBe(200);
    expect((await agentView(nova, attachmentId)).status).toBe(403);
    expect((await humanDownload(owner, attachmentId)).status).toBe(403);
    expect((await humanDownload(peer, attachmentId)).status).toBe(403);

    // A link in the Owner's private DM with Orbit: the Owner sees it; the peer and Nova still cannot.
    await owner.trpc.chat.send.mutate({
        agentId: orbitAgentId,
        content: 'Make me a fox.',
        nonce: 'vis-open-dm',
        serverId,
        targetKind: 'agent-dm',
    });
    await readTargetAsAgent(harness, { agentId: orbitAgentId, serverId }, orbit, 'dm:@ada');
    const dmSend = await fixture.agentCall(orbit, 'POST', '/api/agent/messages/send', {
        content: `Here ${formatImageGenerationLink(generationId)}`,
        nonce: 'vis-dm',
        target: 'dm:@ada',
    });
    expect(dmSend.status).toBe(200);
    const ownerDownload = await humanDownload(owner, attachmentId);
    expect(ownerDownload.status).toBe(200);
    expect(ownerDownload.headers.get('content-type')).toBe('image/png');
    expect((await humanDownload(peer, attachmentId)).status).toBe(403);
    expect((await agentView(nova, attachmentId)).status).toBe(403);

    // A link in a Chat Nova reads lets Nova view it, and so use it as a reference.
    await readTargetAsAgent(harness, { agentId: orbitAgentId, serverId }, orbit, '#shared');
    const shared = await fixture.agentCall(orbit, 'POST', '/api/agent/messages/send', {
        content: `Shared ${formatImageGenerationLink(generationId)}`,
        nonce: 'vis-shared',
        target: '#shared',
    });
    expect(shared.status).toBe(200);
    const novaView = await agentView(nova, attachmentId);
    expect(novaView.status).toBe(200);
    expect(novaView.body.attachment.mediaType).toBe('image/png');
    const reference = await fixture.create(nova, {
        model: 'gpt-image-2.5-sunburst',
        nonce: 'vis-ref',
        referenceAttachmentIds: [attachmentId],
    });
    expect(reference.status).toBe(200);
    // The peer is still outside every Chat that links it.
    expect(channelId).not.toBe(sharedId);
    expect((await humanDownload(peer, attachmentId)).status).toBe(403);
});

function agentView(runner: { token: string }, attachmentId: string) {
    return fixture.agentCall(runner, 'GET', `/api/agent/attachments/${attachmentId}`);
}

function humanDownload(client: HausClient, attachmentId: string) {
    return fetch(new URL(`/attachments/${fixture.serverId}/${attachmentId}`, fixture.harness.url), {
        headers: { authorization: `Bearer ${client.sessionToken}` },
    });
}

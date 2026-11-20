import { expect, test } from 'bun:test';
import type { CloudAgentWork } from '@haus/api';
import { cloudAgentWorkUpdatedTopic } from '../src/realtime/topics.ts';
import { readTargetAsAgent } from './agent-read-target.ts';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';
import { cloudAgentLinkHelpers } from './cloud-agent-link-helpers.ts';
import { createTestProject } from './project.fixture.ts';
import { captureTopic, settleRealtime } from './realtime-capture.ts';
import { startTestTask } from './task-place-fixture.ts';

const fixture = cloudAgentFixture();
const links = cloudAgentLinkHelpers(fixture);

test('a second link shows the card in both Channels and hears every lifecycle change', async () => {
    const runner = await fixture.mintRunner('run_link_two_places');
    const launched = await fixture.postStart(runner, fixture.startBody({ nonce: 'two-places' }));
    const work = launched.body.work as CloudAgentWork;
    const techOpsId = await links.createChannel('tech-ops', [fixture.peerUserId]);
    const linked = await links.humanSend(
        fixture.owner,
        techOpsId,
        `Continuing here: [Fix](cloud-agent://${work.id})`,
        'second-link'
    );
    for (const chatId of [fixture.task.chatId, techOpsId]) {
        const rows = await fixture.peer.trpc.cloudAgentWork.listForChat.query({
            chatId,
            serverId: fixture.serverId,
        });
        expect(rows.map((row) => row.work.id)).toContain(work.id);
    }

    const updates = captureTopic(cloudAgentWorkUpdatedTopic);
    const socket = await fixture.attachComputer();
    await links.observe(socket, {
        observedAt: '2026-10-11T12:00:00.000Z',
        runId: launched.body.runId as string,
        status: 'running',
        workId: work.id,
    });
    await settleRealtime();
    updates.stop();
    expect(
        updates.events.filter((event) => event.workId === work.id).map((event) => event.messageId)
    ).toEqual([launched.body.messageId, linked.message.id]);

    // The Agent's own message view carries every link; the old field keeps the first.
    const historyUrl = new URL('/api/agent/history', fixture.harness.url);
    historyUrl.searchParams.set('target', '#tech-ops');
    const history = (await (
        await fetch(historyUrl, { headers: { authorization: `Bearer ${runner.token}` } })
    ).json()) as { messages: Record<string, unknown>[] };
    expect(history.messages.find((message) => message.id === linked.message.id)).toMatchObject({
        body_kind: 'text',
        cloud_agent_work: { id: work.id },
        cloud_agent_works: [{ id: work.id }],
    });

    // Cancel authority is unchanged: an ordinary Member still cannot.
    await expect(
        fixture.peer.trpc.cloudAgentWork.cancel.mutate({
            serverId: fixture.serverId,
            workId: work.id,
        })
    ).rejects.toThrow(/Owners and Admins/i);
    socket.close();
});

test('deleting the requesting Channel keeps the work, moves Happening now, and settles silently', async () => {
    const launchpadId = await links.createChannel('launchpad', [fixture.peerUserId]);
    const runner = await fixture.mintRunner('run_link_launchpad');
    const launched = await fixture.postStart(
        runner,
        fixture.startBody({
            nonce: 'launchpad',
            task: await taskIn(launchpadId),
            title: 'Survivor',
        })
    );
    const work = launched.body.work as CloudAgentWork;
    const refugeId = await links.createChannel('refuge', [fixture.peerUserId]);
    const refuge = await links.humanSend(
        fixture.owner,
        refugeId,
        `Tracking [Survivor](cloud-agent://${work.id})`,
        'refuge-link'
    );

    const updates = captureTopic(cloudAgentWorkUpdatedTopic);
    await fixture.owner.trpc.chat.deleteChannel.mutate({
        chatId: launchpadId,
        confirmation: 'launchpad',
        serverId: fixture.serverId,
    });
    await settleRealtime();
    updates.stop();
    expect(updates.events.filter((event) => event.workId === work.id)).toEqual([
        {
            chatId: refugeId,
            messageId: refuge.message.id,
            serverId: fixture.serverId,
            taskId: expect.stringMatching(/^tsk_/u),
            workId: work.id,
        },
    ]);

    const active = await fixture.peer.trpc.cloudAgentWork.listActive.query({
        serverId: fixture.serverId,
    });
    expect(active.find((row) => row.work.id === work.id)).toMatchObject({
        conversationChatId: refugeId,
        location: {
            chatId: refugeId,
            kind: 'message',
            messageId: refuge.message.id,
        },
        work: { messageId: launched.body.messageId },
    });

    const socket = await fixture.attachComputer();
    await links.observe(socket, {
        observedAt: '2026-10-11T13:00:00.000Z',
        runId: launched.body.runId as string,
        status: 'completed',
        workId: work.id,
    });
    expect(await fixture.readAttentions(launched.body.runId as string)).toEqual([]);
    socket.close();
});

test('a tombstoned Chat grants nothing even before its purge removes the rows', async () => {
    const tombId = await links.createChannel('tomb', [fixture.peerUserId]);
    const runner = await fixture.mintRunner('run_link_tomb');
    const launched = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'tomb', task: await taskIn(tombId), title: 'Buried' })
    );
    const work = launched.body.work as CloudAgentWork;
    const before = await fixture.peer.trpc.cloudAgentWork.listActive.query({
        serverId: fixture.serverId,
    });
    expect(before.map((row) => row.work.id)).toContain(work.id);

    await fixture.harness.sql`
        update chats set deleted_at = now(), deleted_by_user_id = ${fixture.ownerUserId}
        where id = ${tombId}
    `;
    const after = await fixture.peer.trpc.cloudAgentWork.listActive.query({
        serverId: fixture.serverId,
    });
    expect(after.map((row) => row.work.id)).not.toContain(work.id);

    // Nor can anyone use it as the basis for a new link.
    const otherId = await links.createChannel('elsewhere', [fixture.peerUserId]);
    const attempt = await links.humanSend(
        fixture.peer,
        otherId,
        `[Buried](cloud-agent://${work.id})`,
        'tomb-relink'
    );
    expect(attempt.message.content).toBe('Buried');

    // Cancel authority never depended on a visible link: an Owner still cancels.
    await expect(
        fixture.owner.trpc.cloudAgentWork.cancel.mutate({
            serverId: fixture.serverId,
            workId: work.id,
        })
    ).resolves.toEqual({ cancelRequested: true });
});

test('a second Agent links only work it can read through a Task or a link', async () => {
    const novaId = (
        await fixture.owner.trpc.agent.create.mutate({
            computerId: fixture.computerId,
            displayName: 'Nova',
            handle: 'nova',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId: fixture.serverId,
        })
    ).agent.id;
    const roomId = (
        await createTestProject(fixture.harness, fixture.owner, {
            agentIds: [novaId],
            name: 'nova-room',
            serverId: fixture.serverId,
        })
    ).id;
    const runner = await fixture.mintRunner('run_link_orbit_for_nova');
    const launchIn = async (name: string) => {
        const channelId = await links.createChannel(name, [fixture.peerUserId]);
        const body = fixture.startBody({ nonce: name, task: await taskIn(channelId) });
        const work = (await fixture.postStart(runner, body)).body.work as CloudAgentWork;
        return { channelId, content: `Saw [Fix](cloud-agent://${work.id})`, work };
    };
    const tombstone = (chatId: string) => fixture.harness.sql`
        update chats set deleted_at = now(), deleted_by_user_id = ${fixture.ownerUserId}
        where id = ${chatId}
    `;
    const nova = await mintRunnerFor(novaId, roomId, 'run_nova');
    const novaPost = async (content: string, nonce: string) =>
        (
            await links.agentPost(nova, '/api/agent/messages/send', {
                content,
                nonce,
                target: '#nova-room',
            })
        ).body;

    const vault = await launchIn('vault');
    expect(await novaPost(vault.content, 'nova-through-task')).toMatchObject({
        message: { content: vault.content },
    });

    const crypt = await launchIn('crypt');
    await tombstone(crypt.channelId);
    expect(await novaPost(crypt.content, 'nova-unseen')).toMatchObject({
        message: { content: 'Saw Fix' },
    });

    await links.humanSend(
        fixture.owner,
        roomId,
        `[Fix](cloud-agent://${vault.work.id})`,
        'show-nova'
    );
    await tombstone(vault.channelId);
    await readTargetAsAgent(
        fixture.harness,
        { agentId: novaId, serverId: fixture.serverId },
        nova,
        '#nova-room'
    );
    expect(await novaPost(vault.content, 'nova-seen')).toMatchObject({
        message: { content: vault.content },
    });
});

async function mintRunnerFor(agentId: string, chatId: string, runId: string) {
    const response = await fetch(new URL('/computer/runner/mint', fixture.harness.url), {
        body: JSON.stringify({ agentId, chatId, credentialHash: fixture.credentialHash, runId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    const { runnerToken } = (await response.json()) as { runnerToken: string };
    return { runId, token: runnerToken };
}

async function taskIn(channelId: string) {
    const task = await startTestTask(fixture.harness, fixture.owner, {
        channelId,
        serverId: fixture.serverId,
        title: 'Channel work',
    });
    return task.key;
}

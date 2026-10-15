// "Try image gen out" is answered by the image cards themselves. Regression
// for an Agent that posted the cards, then waited on every image and threaded
// an unrequested model comparison onto its own reply. Opt-in: it spends real
// provider money (a few cents per image) and needs the Owner's image keys.

import { sleep } from '../../eval-harness.mjs';
import { isReady } from '../provisioner.mjs';
import { defineScenario } from '../scenario.mjs';

// The motivating Agent's runtime, model, and effort; `runtime/model/effort`
// overrides it. Its role brief is not reproduced: a role is seeded at create.
const target = (
    process.env.HAUS_AGENT_TEST_IMAGE_TARGET ?? 'claude-code/claude-opus-5-5/medium'
).split('/');
const providerKeys = { gemini: 'HAUS_GEMINI_API_KEY', openai: 'HAUS_OPENAI_API_KEY' };

export default defineScenario({
    agents: [{ kind: 'worker' }],
    optIn: true,
    contract:
        'Asked to try out image generation, an Agent posts one reply linking its image-generation:// cards and authors nothing after it, in the channel or any Thread, without waiting on the images.',
    name: 'image-try-out-stays-quiet',
    async run({ agents, expect, kit, log, settleTurn }) {
        const [worker] = agents;
        await ensureImageKeys(kit, log);
        await reshape(kit, worker, log);
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const request = await kit.harness.send(
            channel.id,
            `Ok! So @${worker.handle} you should now have image gen capability. Including image gen from openai and nano banana. Try it out on some prompts just to test?`
        );
        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn completed').toBe('completed');

        const posts = await authoredAfter(kit, worker.id, channel.id, request.message.sequence);
        const head = posts.find((post) => post.content.includes('image-generation://'));
        const images = head ? head.message.imageGenerations : [];
        for (const post of posts) {
            log(`${post.where}: ${JSON.stringify(post.content.slice(0, 1500))}`);
        }
        const waits = await imageWaits(kit, worker.id, turn.runIds ?? [turn.runId], log);
        log(`images linked: ${images.length}, haus image wait: ${waits ?? 'journal unavailable'}`);
        await logSpend(kit, channel.id, head?.message.id, log);

        expect(Boolean(head), 'inline reply links image-generation:// cards').toBe(true);
        expect(head.where, 'image reply is in the channel').toBe('channel');
        const after = posts.filter((post) => post.createdAt > head.createdAt);
        expect(
            after.map((post) => `${post.where}: ${post.content.slice(0, 80)}`),
            'nothing after the image reply'
        ).toHaveLength(0);
        if (waits !== null) {
            expect(waits, 'turn never ran haus image wait').toBe(0);
        }
    },
});

/** Connects each image provider from the dev env through the Owner's Settings procedure. */
async function ensureImageKeys(kit, log) {
    const settings = await kit.trpc('imageGenerationSettings.get', { serverId: kit.serverId });
    for (const status of settings.providers) {
        const apiKey = process.env[providerKeys[status.provider]];
        if (!status.connected && apiKey) {
            await kit.trpc('imageGenerationSettings.setKey', {
                apiKey,
                provider: status.provider,
                serverId: kit.serverId,
            });
            log(`connected ${status.provider} from ${providerKeys[status.provider]}`);
        }
    }
    const after = await kit.trpc('imageGenerationSettings.get', { serverId: kit.serverId });
    if (!after.providers.some((status) => status.connected)) {
        throw new Error('No image provider is connected and no provider key is in the env.');
    }
}

/** Moves the worker onto the motivating runtime, model, and effort. */
async function reshape(kit, worker, log) {
    const [runtimeId, modelId, reasoningEffort = 'medium'] = target;
    await kit.trpc('agent.configure', {
        agentId: worker.id,
        modelId,
        reasoningEffort,
        runtimeId,
        serverId: kit.serverId,
    });
    for (let attempt = 0; attempt < 120; attempt += 1) {
        const agents = await kit.trpc('agent.list', { serverId: kit.serverId });
        const agent = agents.find((candidate) => candidate.id === worker.id);
        if (agent?.effectiveRuntimeId === runtimeId && isReady(agent)) {
            log(`worker on ${runtimeId}/${agent.effectiveModelId}/${reasoningEffort}`);
            return;
        }
        await sleep(1000);
    }
    throw new Error(`Worker never became ready on ${target.join('/')}.`);
}

/** Every message the Agent wrote after the request, in the channel and in any Thread on it. */
async function authoredAfter(kit, agentId, channelId, sinceSequence) {
    const own = (message) => message.author.kind === 'agent' && message.author.agentId === agentId;
    const page = await kit.trpc('chat.messages', {
        chatId: channelId,
        limit: 100,
        serverId: kit.serverId,
    });
    const posts = page.messages
        .filter((message) => own(message) && message.sequence > sinceSequence)
        .map((message) => ({ message, where: 'channel' }));
    for (const thread of page.threads ?? []) {
        await kit.trackChat(thread.threadChatId);
        const replies = (await kit.readMessages(thread.threadChatId)).filter(own);
        posts.push(
            ...replies.map((message) => ({ message, where: `thread ${thread.threadChatId}` }))
        );
    }
    return posts.map((post) => ({
        ...post,
        content: post.message.content,
        createdAt: Date.parse(post.message.createdAt),
    }));
}

/** How many `haus image wait` commands the turns ran, or null when no journal was readable. */
async function imageWaits(kit, agentId, runIds, log) {
    let readable = false;
    let count = 0;
    for (const runId of runIds) {
        const result = await kit.trpc('agent.executionJournal', {
            agentId,
            runId,
            serverId: kit.serverId,
        });
        if (result.status !== 'available') {
            continue;
        }
        readable = true;
        const commands = result.journal.tools.map((tool) => String(tool.input?.command ?? ''));
        for (const command of commands.filter((entry) => entry.includes('haus '))) {
            log(`ran: ${command.slice(0, 120)}`);
        }
        count += commands.filter((command) => command.includes('haus image wait')).length;
    }
    return readable ? count : null;
}

/** Logs each linked generation's model, state, and cost once they stop rendering. */
async function logSpend(kit, chatId, messageId, log) {
    if (!messageId) {
        return;
    }
    let images = [];
    for (let attempt = 0; attempt < 24; attempt += 1) {
        const page = await kit.trpc('chat.messages', {
            chatId,
            limit: 100,
            serverId: kit.serverId,
        });
        images = page.messages.find((message) => message.id === messageId)?.imageGenerations ?? [];
        if (images.every((image) => ['ready', 'failed'].includes(image.result.state))) {
            break;
        }
        await sleep(5000);
    }
    const usd = images.reduce((sum, image) => sum + (image.result.cost?.usd ?? 0), 0);
    for (const image of images) {
        log(`${image.model}: ${image.result.state} $${image.result.cost?.usd ?? 0}`);
    }
    log(`spend: $${usd.toFixed(3)} over ${images.length} images`);
}

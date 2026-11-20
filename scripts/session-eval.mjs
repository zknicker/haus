// Hosted long-running Agent behavior battery. It proves only behavior visible
// through the public Server contract; generation bookkeeping remains covered
// by focused Computer tests.
//
// Usage: bun run eval:sessions [--server URL] [--server-id id] [--only substring]
import { assert, createEvalHarness, sleep } from './eval-harness.mjs';

const harness = await createEvalHarness({ evalName: 'sessioneval' });
const {
    authoredBy,
    cleanup,
    configureAgent,
    pollMessages,
    readHead,
    readMessages,
    report,
    requireAgents,
    requireChannel,
    requireDm,
    scenario,
    send,
    serverId,
    stamp,
    trpc,
    waitForAgentQuiet,
    waitForTurnActive,
} = harness;

const [alpha] = await requireAgents(1);
const all = await requireChannel('haus');
const product = await requireChannel('product');
const dm = requireDm(alpha);

try {
    await scenario('continuity: a DM fact is known in another Chat', async () => {
        const codename = `Kestrel-${stamp}`;
        const dmHead = await readHead(dm);
        await send(dm, `The deploy codename is ${codename}. Confirm you noted it.`);
        await pollMessages(
            dm,
            (messages) => authoredBy(messages, alpha.id, dmHead).length > 0,
            240_000
        );

        const allHead = await readHead(all);
        await send(
            all,
            `@${alpha.handle} without tools or files, what deploy codename did I just give you in DM? Answer only with it.`
        );
        const messages = await pollMessages(
            all,
            (rows) => authoredBy(rows, alpha.id, allHead).length > 0,
            240_000
        );
        const reply = authoredBy(messages, alpha.id, allHead).join(' ');
        assert(
            reply.toLowerCase().includes(codename.toLowerCase()),
            `global session lost the DM fact: ${reply.slice(0, 200)}`
        );
    });

    await scenario('serialization: a second Chat waits for the active turn', async () => {
        await waitForAgentQuiet(alpha.id, 3000, 120_000);
        const allHead = await readHead(all);
        const productHead = await readHead(product);
        const slowToken = `SLOW-${stamp}`;
        const quickToken = `QUICK-${stamp}`;

        await send(
            all,
            `@${alpha.handle} run this shell command and reply only with its output: sleep 15 && echo ${slowToken}`
        );
        await waitForTurnActive(alpha.id, 60_000);
        await send(product, `@${alpha.handle} reply exactly ${quickToken}.`);

        const deadline = Date.now() + 300_000;
        for (;;) {
            assert(Date.now() < deadline, 'timed out waiting for serialized replies');
            const [allMessages, productMessages] = await Promise.all([
                readMessages(all),
                readMessages(product),
            ]);
            const slowReply = authoredBy(allMessages, alpha.id, allHead).some((text) =>
                text.includes(slowToken)
            );
            const quickReply = authoredBy(productMessages, alpha.id, productHead).some((text) =>
                text.includes(quickToken)
            );
            if (quickReply) {
                assert(slowReply, 'second Chat received a reply before the active turn settled');
                return;
            }
            await sleep(2000);
        }
    });

    await scenario(
        'freshness: a mid-turn message reaches the active Agent',
        async () => {
            await waitForAgentQuiet(alpha.id, 3000, 120_000);
            const head = await readHead(all);
            await send(
                all,
                `@${alpha.handle} run 'sleep 12'. Then name the color mentioned after this request; answer NO-COLOR only if none arrives.`
            );
            await waitForTurnActive(alpha.id, 60_000);
            await sleep(2000);
            await send(all, `The color for ${stamp} is vermilion.`);
            await waitForAgentQuiet(alpha.id, 3000, 240_000);
            const replies = authoredBy(await readMessages(all), alpha.id, head);
            assert(
                replies.some((text) => /vermilion/iu.test(text)),
                `settled reply missed the mid-turn message: ${replies.join(' | ').slice(0, 200)}`
            );
        },
        { retryOn: 'any' }
    );

    await scenario('session reset preserves execution and accepts the next delivery', async () => {
        await trpc('agent.reset', { agentId: alpha.id, kind: 'session', serverId });
        const head = await readHead(dm);
        const token = `RESET-${stamp}`;
        await send(dm, `Reply exactly ${token}.`);
        const messages = await pollMessages(
            dm,
            (rows) => authoredBy(rows, alpha.id, head).some((text) => text.includes(token)),
            240_000
        );
        assert(
            authoredBy(messages, alpha.id, head).some((text) => text.includes(token)),
            'Agent did not accept work after session reset'
        );
    });

    await scenario('model switch applies exactly and the next delivery runs', async () => {
        const computers = await trpc('computer.list', { serverId });
        const assigned = computers.find((computer) => computer.id === alpha.computerId);
        const alternatives =
            assigned?.reportedInventory?.runtimes.flatMap((runtime) =>
                runtime.models.map((model) => ({ modelId: model.id, runtimeId: runtime.id }))
            ) ?? [];
        const target = alternatives.find(
            (candidate) =>
                candidate.runtimeId !== alpha.desiredRuntimeId ||
                candidate.modelId !== alpha.desiredModelId
        );
        assert(target, 'assigned Computer reports no alternate model for the model-switch check');

        await configureAgent(alpha, target.runtimeId, target.modelId);
        const deadline = Date.now() + 120_000;
        for (;;) {
            assert(Date.now() < deadline, 'Computer never applied the switched model');
            const [current] = (await trpc('agent.list', { serverId })).filter(
                (agent) => agent.id === alpha.id
            );
            if (
                current?.effectiveRuntimeId === target.runtimeId &&
                current.effectiveModelId === target.modelId
            ) {
                break;
            }
            await sleep(2000);
        }

        const head = await readHead(dm);
        const token = `MODEL-${stamp}`;
        await send(dm, `Reply exactly ${token}.`);
        await pollMessages(
            dm,
            (messages) => authoredBy(messages, alpha.id, head).some((text) => text.includes(token)),
            240_000
        );
    });
} finally {
    await cleanup();
}

report();

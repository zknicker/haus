import { sleep } from '../../eval-harness.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const terminal = new Set(['completed', 'failed', 'cancelled']);

export default defineScenario({
    agents: [{ kind: 'coordinator' }],
    contract:
        'A natural cloud review request launches real work and its completion wakes the coordinator to bring the outcome back to the requesting channel.',
    name: 'cloud-conversation-handoff',
    optIn: true,
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const input = { chatId: channel.id, serverId: kit.serverId };
        let work;
        try {
            await kit.harness.send(
                channel.id,
                `@${worker.handle} Can you have a cloud agent take a quick look at the README in zknicker/haus on main and tell me what the project does and whether the getting-started instructions seem clear? Just a review; no code changes or PR needed.`
            );
            const launch = await settleTurn(worker.id);
            const works = await kit.trpc('cloudAgentWork.listForChat', input);
            expect(works, 'one real cloud work item').toHaveLength(1);
            work = works[0].work;
            log(`cloud work ${work.id}: ${work.status}`);
            await kit.readMessages(channel.id);
            if (work.chatId !== channel.id) {
                await kit.trackChat(work.chatId);
                await kit.readMessages(work.chatId);
            }
            expect(launch.status, 'launch turn completed').toBe('completed');
            const known = new Set(launch.runIds);
            const deadline = Date.now() + 15 * 60_000;
            let lastStatus = work.status;
            let resumed;
            while (Date.now() < deadline) {
                [work] = (await kit.trpc('cloudAgentWork.listForChat', input)).map(
                    (entry) => entry.work
                );
                if (work.status !== lastStatus) {
                    log(`cloud work ${work.id}: ${work.status}`);
                    lastStatus = work.status;
                }
                const turns = await kit.turns.listTurns(worker.id);
                const state = await kit.turns.deliveryState(worker.id);
                resumed = turns.find((turn) => !known.has(turn.runId) && turn.endedAt);
                if (terminal.has(work.status) && resumed && !state.running && state.pending === 0) {
                    break;
                }
                await sleep(2000);
            }
            expect(work.status, 'provider completed successfully').toBe('completed');
            expect(Boolean(resumed), 'completion woke coordinator').toBe(true);
            const messages = await kit.readMessages(channel.id);
            const outcomes = messages.filter(
                (message) =>
                    message.author.kind === 'agent' &&
                    message.author.agentId === worker.id &&
                    Date.parse(message.createdAt) >= Date.parse(work.terminalAt)
            );
            expect(outcomes.length > 0, 'outcome returned to requester').toBe(true);
            expect(
                outcomes.some(
                    (message) =>
                        (work.providerUrl && message.content.includes(work.providerUrl)) ||
                        /\]\([^)]+\)/u.test(message.content)
                ),
                'outcome links to work'
            ).toBe(true);
            expect(work.chatId, 'cloud launch in requesting channel').toBe(channel.id);
        } finally {
            if (work && !terminal.has(work.status)) {
                await kit.trpc('cloudAgentWork.cancel', {
                    serverId: kit.serverId,
                    workId: work.id,
                });
                log(`requested cancellation of unfinished smoke work ${work.id}`);
            }
        }
    }),
});

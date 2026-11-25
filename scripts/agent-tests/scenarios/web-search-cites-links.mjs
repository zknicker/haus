import { sleep } from '../../eval-harness.mjs';
import { providerForModel } from '../model-login.mjs';
import { journalCommands } from '../placement.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const journalAttempts = 5;
const journalDelayMs = 3000;
const markdownLink = /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/u;
const referenceMarker = new RegExp(
    `[${String.fromCodePoint(0xe2_00)}-${String.fromCodePoint(0xe2_02)}]`,
    'u'
);

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A question that needs a web lookup is answered in the channel with its source cited as a Markdown link, and no raw message send carries a provider reference marker (ADR 0061).',
    name: 'web-search-cites-links',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        await enableWebSearch(kit, worker, log);
        const channel = await kit.createChannel({ agentIds: [worker.id] });

        log('asking a question that needs a current lookup');
        await kit.harness.send(
            channel.id,
            `@${worker.handle} when is the next federal quarterly estimated tax payment due? Look it up.`
        );
        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn completed').toBe('completed');

        const posts = (await turn.authoredMessagesIn(channel.id)).filter(
            (message) => message.chatId === channel.id
        );
        expect(posts.length >= 1, 'Agent answered in the channel').toBe(true);

        const sends = await readMessageSends(kit, worker.id, turn);
        log(`message sends in the journal: ${sends.length}`);
        expect(sends.length >= 1, 'haus message send found in the turn journal').toBe(true);

        const rawMarkers = sends.some((command) => referenceMarker.test(command));
        const linked = posts.some((message) => markdownLink.test(message.content));
        log(`raw send had reference markers: ${rawMarkers}`);
        log(`stored answer has a Markdown link: ${linked}`);
        expect(rawMarkers, 'raw message send carried a provider reference marker').toBe(false);
        expect(linked, 'stored answer cites a Markdown link').toBe(true);
    }),
});

async function enableWebSearch(kit, worker, log) {
    const provider = providerForModel(worker.effectiveModelId);
    if (provider === 'claude') {
        return;
    }
    const { connections } = await kit.trpc('modelConnections.list', { serverId: kit.serverId });
    for (const connection of connections) {
        if (connection.provider === provider && connection.enabled && !connection.webSearch) {
            log(`turning on web search for the ${provider} connection ${connection.label}`);
            await kit.trpc('modelConnections.setWebSearch', {
                connectionId: connection.id,
                enabled: true,
                serverId: kit.serverId,
            });
        }
    }
}

async function readMessageSends(kit, agentId, turn) {
    for (let attempt = 1; attempt <= journalAttempts; attempt += 1) {
        const sends = (await journalCommands(kit, agentId, turn)).filter((command) =>
            /\bhaus\s+message\s+send\b/u.test(command)
        );
        if (sends.length > 0 || attempt === journalAttempts) {
            return sends;
        }
        await sleep(journalDelayMs);
    }
    return [];
}

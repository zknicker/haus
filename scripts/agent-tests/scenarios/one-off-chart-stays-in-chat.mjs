// Counterweight to shared-artifact-discovery: a chart someone wants to see
// right now is one-off delivery, so it belongs in chat (a visual or page
// fence, or an attachment), never in the Server-wide shared library.

import { agentMessages, artifactsCreatedBy, deleteArtifacts } from '../artifact-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    optIn: true,
    contract:
        'Asked to send a quick chart of a few numbers, an Agent delivers it in chat as a fence or an attachment and publishes no shared artifact.',
    name: 'one-off-chart-stays-in-chat',
    async run({ agents, expect, kit, log, settleTurn }) {
        const [worker] = agents;
        let published = [];
        try {
            const head = await kit.readHead(worker.dmChatId);
            await kit.harness.send(
                worker.dmChatId,
                'Send me a quick chart of signups this week: Mon 12, Tue 18, Wed 9, Thu 22, Fri 15.'
            );
            const turn = await settleTurn(worker.id);
            expect(turn.status, 'turn completed').toBe('completed');

            published = await artifactsCreatedBy(kit, worker.id);
            expect(published, 'no shared artifact for a one-off chart').toHaveLength(0);

            const replies = await agentMessages(kit, worker.id, worker.dmChatId, head);
            const text = replies.map((message) => message.content).join('\n');
            const attached = replies.flatMap((message) => message.attachments ?? []);
            const fenced = /```(?:visual|page)\b/u.test(text);
            log(`fence: ${fenced}, attachments: ${attached.length}`);
            expect(fenced || attached.length > 0, 'chart delivered as a fence or attachment').toBe(
                true
            );
        } finally {
            await deleteArtifacts(kit, published);
        }
    },
});

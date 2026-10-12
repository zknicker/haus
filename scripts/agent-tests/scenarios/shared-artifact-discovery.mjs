// No-hint variant of shared-artifact-handoff: the request never says
// "artifact", so the Agent must find `haus artifact` from its prompt's family
// entry and the Manual, keep the file's real extension, and link it.

import { agentMessages, artifactsCreatedBy, deleteArtifacts } from '../artifact-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    optIn: true,
    contract:
        'Asked to share a file with the team so anyone can find it later, without the word artifact, an Agent publishes it once as a shared artifact with a .md filename and links its stable URL in its reply instead of attaching the file.',
    name: 'shared-artifact-discovery',
    async run({ agents, expect, kit, log, marker, settleTurn }) {
        const [worker] = agents;
        const token = marker('NOTES');
        let published = [];
        try {
            const head = await kit.readHead(worker.dmChatId);
            log('asking for a team-wide file without naming the mechanism');
            await kit.harness.send(
                worker.dmChatId,
                `Write up short release notes as a markdown file whose first line is "# ${token}", then share the file with the whole team so anyone on this Server can find it later and we can keep updating it.`
            );
            const turn = await settleTurn(worker.id);
            expect(turn.status, 'turn completed').toBe('completed');

            published = await artifactsCreatedBy(kit, worker.id);
            log(`published: ${published.map((entry) => entry.filename).join(', ') || 'none'}`);
            expect(published, 'exactly one shared artifact published').toHaveLength(1);
            const [artifact] = published;
            expect(/\.md$/u.test(artifact.filename), 'filename keeps its .md extension').toBe(true);

            const replies = await agentMessages(kit, worker.id, worker.dmChatId, head);
            const text = replies.map((message) => message.content).join('\n');
            expect(text, 'reply links the stable URL').toContain(artifact.stable_url);
            const attached = replies.flatMap((message) => message.attachments ?? []);
            expect(attached, 'the file is linked, not also attached').toHaveLength(0);
        } finally {
            await deleteArtifacts(kit, published);
        }
    },
});

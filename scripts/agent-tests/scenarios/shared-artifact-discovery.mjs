// Sharing without a hint: the request never names Drive,
// so the Agent must find its drive/ folder from its prompt's family entry and the
// Manual, write the file there with its real extension, and cite it.

import { agentMessages, artifactsCreatedBy, deleteArtifacts } from '../artifact-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Asked to share a file with the team so anyone can find it later, without naming Drive, an Agent writes it once under its drive/ folder in a Drive area with a .md filename and cites it with a drive:// link in its reply instead of attaching the file.',
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
            log(`published: ${published.map((entry) => entry.path).join(', ') || 'none'}`);
            expect(published, 'exactly one Drive file written').toHaveLength(1);
            const [artifact] = published;
            expect(
                /^(?:haus|projects\/[^/]+|agents\/[^/]+)\/.+\.md$/u.test(artifact.path),
                'written inside a Drive area with its .md extension'
            ).toBe(true);

            const replies = await agentMessages(kit, worker.id, worker.dmChatId, head);
            const text = replies.map((message) => message.content).join('\n');
            expect(text, 'reply cites the Drive file').toContain(`(drive://${artifact.path})`);
            const attached = replies.flatMap((message) => message.attachments ?? []);
            expect(attached, 'the file is cited, not also attached').toHaveLength(0);
        } finally {
            await deleteArtifacts(kit, published);
        }
    },
});

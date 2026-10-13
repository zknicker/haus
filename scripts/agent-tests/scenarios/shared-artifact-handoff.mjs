import { agentMessages, turnCommands } from '../artifact-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    optIn: true,
    contract:
        'Agents discover explicit Server publication and share its stable link, a peer resolves the shared file from that pasted link alone, and publishes an immutable revision while personal source files stay retained.',
    name: 'shared-artifact-handoff',
    async run({ agents, expect, kit, log, marker, settleTurn }) {
        const [publisher, editor] = agents;
        const original = marker('ORIGINAL');
        const revised = marker('REVISED');
        const name = `handoff-${kit.stamp.toLowerCase()}`;
        const path = `shared-handoff/${kit.stamp}.txt`;
        let artifactId;
        try {
            log('asking the publisher to discover file sharing');
            const publisherHead = await kit.readHead(publisher.dmChatId);
            await kit.harness.send(
                publisher.dmChatId,
                `Create ${path} in your workspace with exactly "${original}" followed by a newline. Publish it as a shared Server artifact named ${name}, titled "Shared handoff". Keep your personal source file, and tell me when it is shared.`
            );
            const publishTurn = await settleTurn(publisher.id);
            expect(publishTurn.status, 'publish turn completed').toBe('completed');
            const listed = await kit.trpc('artifact.list', {
                serverId: kit.serverId,
                query: name,
            });
            const artifact = listed.artifacts.find((entry) => entry.name === name);
            expect(artifact, 'shared artifact was published').toBeTruthy();
            artifactId = artifact.artifact_id;
            expect(await bytes(kit, artifact), 'original published bytes').toBe(`${original}\n`);
            const source = await kit.trpc('agent.workspaceFile', {
                agentId: publisher.id,
                serverId: kit.serverId,
                path,
            });
            expect(source.content, 'personal source retained').toBe(`${original}\n`);
            const announced = (
                await agentMessages(kit, publisher.id, publisher.dmChatId, publisherHead)
            )
                .map((message) => message.content)
                .join('\n');
            expect(announced, 'publisher shared the stable link').toContain(artifact.stable_url);

            log('asking a different Agent to retrieve and revise');
            await kit.harness.send(
                editor.dmChatId,
                `Here is a shared file: ${artifact.stable_url} Read it and report the exact marker you find. Create a writable personal copy at ${path}, replace its contents with exactly "${revised}" followed by a newline, and publish that as a new revision of the same artifact, titled "Revised handoff". Keep the original shared revision unchanged. Reply with the original marker and the updated artifact link.`
            );
            const editTurn = await settleTurn(editor.id);
            expect(editTurn.status, 'edit turn completed').toBe('completed');
            const reply = await kit.awaitAgentReply(editor.dmChatId, editor.id, (message) =>
                message.content.includes(original)
            );
            expect(reply.message.content, 'peer read the undisclosed original marker').toContain(
                original
            );
            const commands = (await turnCommands(kit, editor.id, editTurn)).join('\n');
            log(
                `editor artifact commands: ${commands
                    .split('\n')
                    .filter((line) => line.includes('haus artifact'))
                    .join(' | ')
                    .slice(0, 600)}`
            );
            expect(
                new RegExp(`artifact view\\s+['"]?${artifactId}`, 'u').test(commands),
                'peer resolved the pasted link with artifact view'
            ).toBe(true);
            const result = await kit.trpc('artifact.get', {
                serverId: kit.serverId,
                artifact_id: artifactId,
            });
            expect(result.artifact.revision_number, 'second revision selected').toBe(2);
            expect(await bytes(kit, result.artifact), 'revised published bytes').toBe(
                `${revised}\n`
            );
            expect(await bytes(kit, artifact), 'original revision stayed immutable').toBe(
                `${original}\n`
            );
        } finally {
            if (artifactId) {
                await kit.trpc('artifact.delete', {
                    serverId: kit.serverId,
                    artifact_id: artifactId,
                });
            }
        }
    },
});

async function bytes(kit, artifact) {
    const download = await kit.trpc('artifact.download', {
        serverId: kit.serverId,
        artifact_id: artifact.artifact_id,
        revision_id: artifact.revision_id,
    });
    const response = await fetch(download.download_url);
    if (!response.ok) {
        throw new Error(`Shared file download failed: ${response.status}`);
    }
    return response.text();
}

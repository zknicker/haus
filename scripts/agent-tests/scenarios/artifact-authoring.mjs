// An Agent asked for a shareable page must produce two durable things: the
// workspace file it claims to have written, and a `page` fence in Chat that
// points at that exact path. Rendering is the App lane's job, not this one.

import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An Agent asked for a shared HTML page writes the exact workspace file, whose bytes carry the requested heading, and shares it as a page fence naming that same path.',
    name: 'artifact-authoring',
    async run({ agents, expect, kit, log, marker, settleTurn }) {
        const [worker] = agents;
        const token = marker('ARTIFACT');
        const artifactPath = `eval-artifacts/${kit.stamp}.html`;
        const artifactTitle = `Eval page ${kit.stamp}`;
        expect(worker.dmChatId, 'worker Owner DM').toBeTruthy();

        log('asking for the page');
        const head = await kit.readHead(worker.dmChatId);
        await kit.harness.send(
            worker.dmChatId,
            `Create a self-contained HTML status page at ${artifactPath} whose visible heading is exactly "${token}". Share it here as a page card titled "${artifactTitle}".`
        );

        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn status').toBe('completed');
        expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');
        expect(turn.outputProduced, 'turn produced durable output').toBe(true);

        log('checking gates');
        const replies = await agentReplies(kit, worker.id, worker.dmChatId, head);
        expect(replies, 'a page fence in the reply').toContain('```page');
        expect(replies, 'the page path in the reply').toContain(artifactPath);

        const file = await kit.trpc('agent.workspaceFile', {
            agentId: worker.id,
            path: artifactPath,
            serverId: kit.serverId,
        });
        expect(file.path, 'workspace file path').toBe(artifactPath);
        expect(file.encoding, 'workspace file encoding').toBe('utf8');
        expect(file.content, 'workspace file bytes').toContain(token);
    },
});

/** Agent replies in the Owner DM, including any Thread the Agent opened there. */
async function agentReplies(kit, agentId, chatId, sinceSequence) {
    const page = await kit.trpc('chat.messages', { chatId, limit: 100, serverId: kit.serverId });
    const collected = kit.authoredBy(page.messages, agentId, sinceSequence);
    for (const thread of page.threads ?? []) {
        const messages = await kit.readMessages(thread.threadChatId);
        collected.push(...kit.authoredBy(messages, agentId));
    }
    return collected;
}

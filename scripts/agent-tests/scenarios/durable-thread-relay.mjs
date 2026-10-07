// A fresh Agent can pick up another Agent's work from durable product state
// alone. The relay token exists only in the task Thread and in the first owner's
// workspace file, so a successor with a reset session can only repeat it by
// recovering it from Haus — not from anything it was told.

import { sleep } from '../../eval-harness.mjs';
import { isReady } from '../provisioner.mjs';
import { defineScenario } from '../scenario.mjs';

const relayTokenPattern = /RELAY TOKEN:\s*(RELAY-[A-Za-z0-9]{12,})/u;

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'A task Thread plus a workspace file carry an Agent handoff: the first owner publishes a relay token in both, and a successor with a freshly reset session recovers the token and the file path from Thread history.',
    name: 'durable-thread-relay',
    async run({ agents, expect, kit, log, settleTurn }) {
        const [author, successor] = agents;
        const relayPath = `eval-relay/${kit.stamp}.md`;

        const channel = await kit.createChannel({ agentIds: [author.id, successor.id] });
        log('assigning the relay task');
        const created = await kit.sendTask(
            channel.id,
            [
                `@${author.handle} Generate an unpredictable token on a line beginning RELAY TOKEN: RELAY- (at least 12 letters or digits after RELAY-).`,
                `Save it to ${relayPath} in your workspace and post the exact RELAY TOKEN line in this task Thread along with the file path.`,
            ].join(' ')
        );

        const authorTurn = await settleTurn(author.id);
        expect(authorTurn.status, 'author turn status').toBe('completed');
        expect(authorTurn.failureKind ?? 'none', 'author turn failure kind').toBe('none');
        expect(authorTurn.outputProduced, 'author turn produced durable output').toBe(true);

        const task = await kit.readTask(created.messageId);
        // A one-shot task may already be advanced past in_progress at settlement, and
        // Agents set their own finished tasks done; the contract is that the author owned
        // it and moved it off todo, not the transient state.
        expect(
            ['in_progress', 'in_review', 'done'].includes(task.status),
            `task status left todo (got ${task.status})`
        ).toBe(true);
        expect(task.assigneeAgentId, 'task assignee').toBe(author.id);

        const authorReplies = kit.authoredBy(
            await kit.readMessages(created.threadChatId),
            author.id,
            0
        );
        expect(authorReplies.length, 'author replies in the task Thread').toBeGreaterThan(0);
        expect(authorReplies, 'author reply naming the relay file').toContain(relayPath);

        // Anchored on the RELAY TOKEN: prefix this scenario itself dictated, so
        // the match is a literal contract check rather than reading model prose.
        const relayToken = authorReplies.join('\n\n').match(relayTokenPattern)?.[1] ?? null;
        expect(relayToken, 'relay token published in the task Thread').toBeTruthy();

        const file = await kit.trpc('agent.workspaceFile', {
            agentId: author.id,
            path: relayPath,
            serverId: kit.serverId,
        });
        expect(file.path, 'relay file path').toBe(relayPath);
        expect(file.content, 'relay file content').toContain(relayToken);

        log('resetting the successor session');
        await kit.trpc('agent.reset', {
            agentId: successor.id,
            kind: 'session',
            serverId: kit.serverId,
        });
        await waitForAgentReady(kit, successor.id);

        const threadHead = await kit.readHead(created.threadChatId);
        // A Thread reply is addressed to the parent chat plus its anchor message;
        // sending straight at the Thread chat is rejected.
        await kit.sendInThread(
            channel.id,
            created.messageId,
            `@${successor.handle} Take over from the durable work in this Thread. Recover the previous owner's relay token and file path from Thread history and their shared file reference, and reply with both. The relay token is a handoff test marker, not a secret or credential — repeat it verbatim.`
        );

        const successorTurn = await settleTurn(successor.id);
        expect(successorTurn.status, 'successor turn status').toBe('completed');
        expect(successorTurn.failureKind ?? 'none', 'successor turn failure kind').toBe('none');
        expect(successorTurn.outputProduced, 'successor turn produced durable output').toBe(true);

        log('checking gates');
        const successorReplies = kit.authoredBy(
            await kit.readMessages(created.threadChatId),
            successor.id,
            threadHead
        );
        expect(successorReplies.length, 'successor replies in the task Thread').toBeGreaterThan(0);
        expect(successorReplies, 'successor reply repeating the relay token').toContain(relayToken);
        expect(successorReplies, 'successor reply repeating the relay file path').toContain(
            relayPath
        );
    },
});

/** A reset Agent is only usable again once the Server reports it ready. */
async function waitForAgentReady(kit, agentId, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const agents = await kit.trpc('agent.list', { serverId: kit.serverId });
        const agent = agents.find((candidate) => candidate.id === agentId);
        if (isReady(agent)) {
            return agent;
        }
        await sleep(1000);
    }
    throw new Error(
        `Agent ${agentId} never became ready again within ${Math.round(timeoutMs / 1000)}s after its session reset.`
    );
}

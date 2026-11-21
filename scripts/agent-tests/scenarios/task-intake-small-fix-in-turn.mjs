import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentWorkspacePath } from '../author.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { claimOn, expectSettled, postsAcross, tasksCreatedBy } from '../task-intake.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const fileName = 'launch-notes.md';
const broken = '# Bluebird launch\n\nShipping to independant bookstores on Tuesday.\n';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A one-line fix the Agent can finish in its turn is claimed, made, and answered with one inline reply, with no Task created.',
    name: 'task-intake-small-fix-in-turn',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const workspace = agentWorkspacePath({
            agentId: worker.id,
            repositoryRoot,
            serverId: kit.serverId,
        });
        if (!existsSync(workspace)) {
            throw new Error(
                `No workspace for Agent ${worker.id} at ${workspace}; this scenario needs the Agent on this worktree's dev Computer.`
            );
        }
        const notes = path.join(workspace, fileName);
        await writeFile(notes, broken);
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const head = await kit.readHead(channel.id);

        log('asking for the small fix');
        const request = await kit.harness.send(
            channel.id,
            `@${worker.handle} can you fix the typo in ${fileName} in your workspace? "independant" should be "independent".`
        );
        const turn = await settleTurn(worker.id);
        expectSettled(expect, turn, 'turn');

        log('checking gates');
        const fixed = await readFile(notes, 'utf8');
        expect(fixed.includes('independent bookstores'), 'the file is fixed').toBe(true);
        expect(fixed.includes('independant'), 'the typo is gone').toBe(false);

        const claim = await claimOn(kit, channel.id, request.message.id);
        expect(claim?.assigneeAgentId, 'the request is claimed by the Agent').toBe(worker.id);

        const posts = await postsAcross(kit, channel.id, worker.id, head);
        expect(posts, 'Agent posts in the channel').toHaveLength(1);
        expect(posts[0].reply?.rootMessageId, 'the reply is inline on the request').toBe(
            request.message.id
        );
        expect(await tasksCreatedBy(kit, worker.id, turn), 'Tasks the Agent created').toHaveLength(
            0
        );
    }),
});

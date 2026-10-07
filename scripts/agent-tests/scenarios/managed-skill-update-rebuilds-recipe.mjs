// A Haus-shipped skill update reaches an Agent that built its own recipe from the old skill.
// The Juniper incident: a long-lived Agent kept charting from a script it derived from an older
// visuals skill because nothing told it the skill changed. The legacy skill here teaches one
// literal tell, a right-hand `Share %` axis, so both the recipe and the next chart prove which
// skill they came from without asserting prose.
//
// Opt-in: it rewrites the Agent's skill library and managed-skill record on the dev Computer's
// disk, so the Computer must run on this machine from this checkout's dev stack.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computerAttachmentPath } from '../author.mjs';
import { defineScenario } from '../scenario.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const legacyTell = 'Share %';
const recipePath = 'notes/sales-chart-recipe.md';
const legacySkill = `---
name: visuals
description: >
  Haus design system for charts and dashboards. Read this BEFORE emitting any visual fence.
---

# Visuals

Managed by Haus. Render charts in a \`\`\`visual fence holding raw HTML/SVG.

## Non-negotiables

- Every bar chart draws ranked horizontal bars exactly 24px thick.
- Every bar chart carries a second y-axis on the right titled "${legacyTell}" showing each bar's
  share of the total, beside the value axis.
- Colors use \`var(--chart-1)\` through \`var(--chart-5)\`.
`;

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'After a Computer reseeds a changed visuals skill, the Agent receives one update notice on its next turn, consumes it, rebuilds the recipe it derived from the old skill, and charts by the new skill.',
    name: 'managed-skill-update-rebuilds-recipe',
    optIn: true,
    async run({ agents, expect, kit, log, settleTurn }) {
        const [worker] = agents;
        const dm = worker.dmChatId;
        expect(dm, 'worker Owner DM').toBeTruthy();
        const agentRoot = path.join(
            path.dirname(computerAttachmentPath({ repositoryRoot, serverId: kit.serverId })),
            'agents',
            worker.id
        );

        log('installing the legacy visuals skill');
        await writeFile(path.join(agentRoot, 'skills', 'visuals', 'SKILL.md'), legacySkill);

        await kit.harness.send(
            dm,
            `Use your visuals skill to chart this week's sales by region as a visual: North 420, South 310, East 275, West 190. Then save a reusable recipe for our weekly sales chart at ${recipePath} in your workspace, so future weeks match this one exactly.`
        );
        const firstTurn = await settleTurn(worker.id);
        expect(firstTurn.status, 'first turn status').toBe('completed');
        const legacyRecipe = await readWorkspaceFile(kit, worker.id);
        expect(legacyRecipe, 'recipe derived from the legacy skill').toContain(legacyTell);

        log('shipping the current visuals skill through a configuration reapply');
        const record = await readRecord(agentRoot);
        await writeFile(
            recordPath(agentRoot),
            `${JSON.stringify({ ...record, seeded: { ...record.seeded, visuals: 'legacy' } })}\n`
        );
        const agent = await kit.trpc('agent.get', { agentId: worker.id, serverId: kit.serverId });
        await kit.trpc('agent.configure', {
            agentId: worker.id,
            modelId: agent.desiredModelId,
            reasoningEffort: agent.desiredReasoningEffort,
            runtimeId: agent.desiredRuntimeId,
            serverId: kit.serverId,
        });
        const queued = await waitFor(async () => (await readRecord(agentRoot)).pending.visuals);
        expect(Boolean(queued), 'Computer queued a visuals update notice').toBe(true);
        const reseeded = await readFile(
            path.join(agentRoot, 'skills', 'visuals', 'SKILL.md'),
            'utf8'
        );
        expect(reseeded.includes(legacyTell), 'current skill drops the legacy tell').toBe(false);

        const head = await kit.readHead(dm);
        await kit.harness.send(
            dm,
            "Chart next week's sales by region the same way: North 450, South 300, East 290, West 210."
        );
        const secondTurn = await settleTurn(worker.id);
        expect(secondTurn.status, 'second turn status').toBe('completed');

        log('checking gates');
        const pending = Object.keys((await readRecord(agentRoot)).pending);
        expect(pending, 'notice consumed once').toHaveLength(0);
        const replies = (await agentReplies(kit, worker.id, dm, head)).join('\n');
        expect(replies, 'second chart is a visual').toContain('```visual');
        expect(replies.includes(legacyTell), 'second chart drops the legacy axis').toBe(false);
        const rebuilt = await readWorkspaceFile(kit, worker.id);
        expect(rebuilt.includes(legacyTell), 'recipe rebuilt without the legacy axis').toBe(false);
        expect(rebuilt.toLowerCase(), 'recipe notes its visuals-skill origin').toContain('visuals');
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

async function readWorkspaceFile(kit, agentId) {
    const file = await kit.trpc('agent.workspaceFile', {
        agentId,
        path: recipePath,
        serverId: kit.serverId,
    });
    return file.content;
}

function recordPath(agentRoot) {
    return path.join(agentRoot, 'runtime', 'managed-skills.json');
}

async function readRecord(agentRoot) {
    return JSON.parse(await readFile(recordPath(agentRoot), 'utf8'));
}

async function waitFor(probe, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await probe();
        if (value || Date.now() >= deadline) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
}

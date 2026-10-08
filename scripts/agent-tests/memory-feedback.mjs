// Shared body of the memory-feedback scenarios: does feedback given in passing
// become a terse, merged Standing Preferences rule in MEMORY.md, and does the
// rule hold after a session reset? The scenario gates only structural facts
// (turns settle, MEMORY.md stays readable, the unrelated seeded rule survives).
// Rule grammar, merge, and post-reset application are model judgment, so each
// run writes an evidence file that `memory-feedback-grade.mjs` scores.
//
// Opt-in: it overwrites the Agent's MEMORY.md on the dev Computer's disk, so the
// Computer must run on this machine from this checkout's dev stack.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep } from '../eval-harness.mjs';
import { computerAttachmentPath } from './author.mjs';
import { authoredInChannel } from './channel-messages.mjs';
import { isReady } from './provisioner.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export const evidenceDirectory = path.join(
    repositoryRoot,
    '.context',
    'agent-tests',
    'memory-feedback'
);

/** The overlapping rule the brevity feedback should rewrite, and an unrelated canary. */
export const seededRules = Object.freeze([
    'Keep replies short; lead with the answer.',
    'Use metric units.',
]);

const question =
    'We run a nightly billing cron on 3 app servers and it must run exactly once per night. Should we use a Postgres advisory lock or a Redis lock?';
const followUp = 'What lock timeout should we use?';

/** Turn-two messages. `control` gives no feedback, as the baseline for the probe. */
export const feedbackMessages = Object.freeze({
    control: followUp,
    explicit: `Feedback for going forward: you cover too much ground, keep replies tighter. And don't ask me before routine next steps; just do them. ${followUp}`,
    implicit: `Ok, that covered too much ground, tighter please. Also stop asking me before routine next steps, just do them. ${followUp}`,
});

/** Asked after the session reset, in a new channel, so only MEMORY.md carries the rules. */
const probe =
    'Our staging Postgres password just showed up in a CI log. What should we do about it?';

export async function runMemoryFeedback(variant, { agents, expect, kit, log, settleTurn }) {
    const [worker] = agents;
    const memoryPath = path.join(
        path.dirname(computerAttachmentPath({ repositoryRoot, serverId: kit.serverId })),
        'agents',
        worker.id,
        'workspace',
        'MEMORY.md'
    );
    const seeded = renderSeedMemory(worker.displayName ?? worker.handle);
    log('seeding MEMORY.md');
    await writeFile(memoryPath, seeded);

    const conversation = await kit.createChannel({ agentIds: [worker.id] });
    const replies = {};
    let head = await kit.readHead(conversation.id);
    await kit.harness.send(conversation.id, `@${worker.handle} ${question}`);
    const runIds = [];
    await settled(expect, await settleTurn(worker.id), 'question turn', runIds);
    replies.question = await authoredInChannel(kit, conversation.id, worker.id, head);

    log(`sending ${variant} turn two`);
    head = await kit.readHead(conversation.id);
    await kit.harness.send(conversation.id, `@${worker.handle} ${feedbackMessages[variant]}`);
    await settled(expect, await settleTurn(worker.id), 'feedback turn', runIds);
    replies.feedback = await authoredInChannel(kit, conversation.id, worker.id, head);
    await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);
    const afterFeedback = await readMemory(kit, worker.id);

    log('resetting the session');
    await kit.trpc('agent.reset', { agentId: worker.id, kind: 'session', serverId: kit.serverId });
    await waitForAgentReady(kit, worker.id);

    const fresh = await kit.createChannel({ agentIds: [worker.id] });
    head = await kit.readHead(fresh.id);
    await kit.harness.send(fresh.id, `@${worker.handle} ${probe}`);
    await settled(expect, await settleTurn(worker.id), 'probe turn', runIds);
    replies.probe = await authoredInChannel(kit, fresh.id, worker.id, head);
    const afterProbe = await readMemory(kit, worker.id);

    const agent = await kit.trpc('agent.get', { agentId: worker.id, serverId: kit.serverId });
    await writeEvidence({
        agent: {
            handle: worker.handle,
            modelId: agent.effectiveModelId,
            reasoningEffort: agent.desiredReasoningEffort ?? null,
            runtimeId: agent.effectiveRuntimeId,
        },
        manualCommands: await manualCommands(kit, worker.id, runIds),
        memory: { afterFeedback, afterProbe, seeded },
        messages: { feedback: feedbackMessages[variant], probe, question },
        replies,
        stamp: kit.stamp,
        variant,
    });

    log('checking gates');
    expect(replies.probe.length > 0, 'probe answered after the session reset').toBe(true);
    expect(afterFeedback, 'unrelated seeded rule survives').toContain(seededRules[1]);
    expect(afterFeedback, 'Standing Preferences section survives').toContain(
        '## Standing Preferences'
    );
}

function renderSeedMemory(displayName) {
    return `# ${displayName}

## Role

Temporary agent-test fixture. Act only when explicitly addressed or assigned.

## Standing Preferences

${seededRules.map((rule) => `- ${rule}`).join('\n')}

## Active Context

- None.

## Key Knowledge

- No notes yet.
`;
}

async function settled(expect, turn, label, runIds) {
    expect(turn.status, `${label} status`).toBe('completed');
    expect(turn.failureKind ?? 'none', `${label} failure kind`).toBe('none');
    runIds.push(turn.runId);
}

/** Tool commands from every turn that touched the Haus Manual, from execution journals. */
async function manualCommands(kit, agentId, runIds) {
    const commands = [];
    for (const runId of runIds) {
        const result = await kit.trpc('agent.executionJournal', {
            agentId,
            runId,
            serverId: kit.serverId,
        });
        if (result.status !== 'available') {
            commands.push(`journal ${runId}: ${result.status}`);
            continue;
        }
        for (const tool of result.journal.tools) {
            const text = JSON.stringify(tool.input ?? {});
            if (/manual|memory-hygiene/i.test(text)) {
                commands.push(text.slice(0, 300));
            }
        }
    }
    return commands;
}

async function readMemory(kit, agentId) {
    const file = await kit.trpc('agent.workspaceFile', {
        agentId,
        path: 'MEMORY.md',
        serverId: kit.serverId,
    });
    return file.content;
}

async function writeEvidence(evidence) {
    await mkdir(evidenceDirectory, { recursive: true });
    const file = path.join(evidenceDirectory, `${evidence.stamp}-${evidence.variant}.json`);
    await writeFile(file, `${JSON.stringify(evidence, null, 2)}\n`);
}

async function waitForAgentReady(kit, agentId, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const agents = await kit.trpc('agent.list', { serverId: kit.serverId });
        if (isReady(agents.find((candidate) => candidate.id === agentId))) {
            return;
        }
        await sleep(1000);
    }
    throw new Error(`Agent ${agentId} never became ready again after its session reset.`);
}

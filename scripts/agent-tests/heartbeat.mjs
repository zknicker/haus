// Shared pieces of the heartbeat scenarios (specs/heartbeat.md#evals): seeded
// workspace memory, the dev-only Server trigger and seeding routes, the dream
// record read, and the evidence file `heartbeat-grade.mjs` scores. Pure helpers
// are covered by heartbeat.test.mjs; everything that talks to a stack is live.
//
// Opt-in: scenarios overwrite the Agent's MEMORY.md on the dev Computer's disk,
// so the Computer must run on this machine from this checkout's dev stack.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep } from '../eval-harness.mjs';
import { agentWorkspacePath } from './author.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export const evidenceDirectory = path.join(repositoryRoot, '.context', 'agent-tests', 'heartbeat');

/** The unrelated rule every seeded memory carries, a canary the run must not drop. */
export const canaryRule = 'Use metric units.';

/** Seeded MEMORY.md in the section layout the memory-hygiene recipe edits. */
export function renderMemory({
    activeContext = ['None.'],
    displayName,
    keyKnowledge = ['No notes yet.'],
    role = 'Temporary agent-test fixture. Act only when explicitly addressed or assigned.',
    rules = ['Keep replies short; lead with the answer.', canaryRule],
}) {
    const bullets = (lines) => lines.map((line) => `- ${line}`).join('\n');
    return `# ${displayName}

## Role

${role}

## Standing Preferences

${bullets(rules)}

## Active Context

${bullets(activeContext)}

## Key Knowledge

${bullets(keyKnowledge)}
`;
}

/** The lines under `## Standing Preferences`, bullets stripped; null when the section is gone. */
export function standingPreferenceLines(memory) {
    const match = /## Standing Preferences\n([\s\S]*?)(?=\n## |$)/u.exec(memory ?? '');
    if (!match) {
        return null;
    }
    return match[1]
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => line.replace(/^\s*[-*]\s+/u, '').trim());
}

/** Preference lines present after but not before. */
export function newPreferenceLines(before, after) {
    const known = new Set(before ?? []);
    return (after ?? []).filter((line) => !known.has(line));
}

/** The 24-hour clock fields of an instant in an IANA zone, as { hour, minute }. */
export function zonedClock(isoInstant, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        minute: 'numeric',
        timeZone,
    }).formatToParts(new Date(isoInstant));
    const field = (type) => Number(parts.find((part) => part.type === type)?.value);
    return { hour: field('hour'), minute: field('minute') };
}

/** Whether an instant falls from 08:00 through 10:00 on the wall clock of `timeZone`. */
export function inMorningWindow(isoInstant, timeZone) {
    const { hour, minute } = zonedClock(isoInstant, timeZone);
    return hour === 8 || hour === 9 || (hour === 10 && minute === 0);
}

export function wordCount(text) {
    return String(text ?? '')
        .split(/\s+/u)
        .filter(Boolean).length;
}

export function memoryPath(agentId, serverId) {
    return path.join(agentWorkspacePath({ agentId, repositoryRoot, serverId }), 'MEMORY.md');
}

export async function writeMemory(kit, agentId, content) {
    await writeFile(memoryPath(agentId, kit.serverId), content);
}

export async function readMemory(kit, agentId) {
    const file = await kit.trpc('agent.workspaceFile', {
        agentId,
        path: 'MEMORY.md',
        serverId: kit.serverId,
    });
    return file.content;
}

/** Appends Messages without waking anyone; the Agent's live session never sees them. */
/** The heartbeat members of the agent-test kit, bound to one stack. */
export function heartbeatKitMembers(stack) {
    return {
        heartbeatEvidence: (agentIds) => heartbeatEvidence(stack, agentIds),
        seedMessages: (chatId, messages) => seedMessages(stack, chatId, messages),
        startHeartbeat: (agentId, kind, options) => startHeartbeat(stack, agentId, kind, options),
    };
}

export function seedMessages(kit, chatId, messages) {
    return kit.trpc('dev.seedHeartbeatMessages', { chatId, messages, serverId: kit.serverId });
}

/**
 * Starts a heartbeat run now through the dev-only trigger and waits for the Agent
 * to settle, including any report run it queues for its main session.
 */
export async function startHeartbeat(kit, agentId, kind, options = {}) {
    const triggeredAt = Date.now();
    await kit.trpc('dev.startHeartbeat', { agentId, kind, serverId: kit.serverId });
    const turn = await kit.settleTurn(agentId, { startWithin: 60_000, ...options });
    return { ...turn, kind, triggeredAt };
}

/** Reports the Agents queued for their main sessions, and the Server's recent leads. */
export function heartbeatEvidence(kit, agentIds) {
    return kit.trpc('dev.heartbeatEvidence', { agentIds, serverId: kit.serverId });
}

/**
 * The dream record the nightly run left, once the Computer has reported it and the
 * run's summary is stored. A record without a summary after the grace window is
 * returned as is: "no summary" is a result the scenario gates on.
 */
export async function awaitDream(
    kit,
    agentId,
    sinceMs,
    { graceMs = 45_000, timeoutMs = 180_000 } = {}
) {
    const deadline = Date.now() + timeoutMs;
    let foundAt = null;
    for (;;) {
        const page = await kit.trpc('agent.dreams', { agentId, limit: 5, serverId: kit.serverId });
        const dream = page.dreams.find((entry) => Date.parse(entry.startedAt) >= sinceMs - 5000);
        if (dream) {
            foundAt ??= Date.now();
            if (dream.summary || Date.now() - foundAt >= graceMs) {
                return dream;
            }
        }
        if (Date.now() >= deadline) {
            if (dream) {
                return dream;
            }
            throw new Error(
                `Agent ${agentId} left no dream record within ${Math.round(timeoutMs / 1000)}s.`
            );
        }
        await sleep(3000);
    }
}

/** Tool calls across a settled turn's runs; journals sync asynchronously, so `missing` retries. */
export async function journalCommands(kit, agentId, turn, { attempts = 10, delayMs = 3000 } = {}) {
    const commands = [];
    for (const runId of turn.runIds ?? [turn.runId]) {
        let result = null;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            result = await kit.trpc('agent.executionJournal', {
                agentId,
                runId,
                serverId: kit.serverId,
            });
            if (result.status === 'available') {
                break;
            }
            await sleep(delayMs);
        }
        if (result?.status !== 'available') {
            throw new Error(
                `Execution journal for run ${runId} stayed ${result?.status ?? 'unreadable'}.`
            );
        }
        for (const tool of result.journal.tools) {
            if (typeof tool.input?.command === 'string') {
                commands.push(tool.input.command);
            }
        }
    }
    return commands;
}

/** Agent-authored messages in a chat after `sinceSequence`, including task Threads promoted from it. */
export async function agentPosts(kit, chatId, agentId, sinceSequence = 0) {
    const messages = await kit.readMessages(chatId);
    return kit.authoredBy(messages, agentId, sinceSequence);
}

export async function writeEvidence(evidence) {
    await mkdir(evidenceDirectory, { recursive: true });
    const file = path.join(evidenceDirectory, `${evidence.stamp}-${evidence.scenario}.json`);
    await writeFile(file, `${JSON.stringify(evidence, null, 2)}\n`);
}

/** The kit-facing agent facts every evidence file carries. */
export async function describeAgent(kit, worker) {
    const agent = await kit.trpc('agent.get', { agentId: worker.id, serverId: kit.serverId });
    return {
        handle: worker.handle,
        modelId: agent.effectiveModelId,
        reasoningEffort: agent.desiredReasoningEffort ?? null,
        runtimeId: agent.effectiveRuntimeId,
    };
}

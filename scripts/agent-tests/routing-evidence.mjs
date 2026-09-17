import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { captureAgentDiagnostics } from './report.mjs';

/** Preserve every destination and resumed journal before the runner retires its Agents. */
export function withRoutingEvidence(run) {
    return async (context) => {
        try {
            return await run(context);
        } finally {
            const evidence = await captureRoutingEvidence(context.kit, context.agents);
            const directory = path.join('.context/agent-tests/evidence', context.kit.stamp);
            await mkdir(directory, { recursive: true });
            const file = path.join(directory, `${context.kit.scenarioName}.json`);
            await writeFile(file, `${JSON.stringify(evidence, null, 4)}\n`);
            context.log(`full routing evidence: ${file}`);
        }
    };
}

export async function captureRoutingEvidence(kit, agents) {
    const chats = [];
    const pending = new Set(kit.transcript().chats.map((chat) => chat.id));
    const errors = [];
    for (const chatId of pending) {
        try {
            let beforeSequence;
            const messages = [];
            do {
                const page = await kit.trpc('chat.messages', {
                    chatId,
                    serverId: kit.serverId,
                    limit: 100,
                    ...(beforeSequence ? { beforeSequence } : {}),
                });
                messages.push(...page.messages);
                for (const thread of page.threads) {
                    pending.add(thread.threadChatId);
                    await kit.trackChat(thread.threadChatId);
                }
                beforeSequence = page.nextBeforeSequence;
            } while (beforeSequence);
            chats.push({ chatId, messages });
        } catch (error) {
            errors.push({ chatId, error: String(error) });
        }
    }
    const diagnostics = await captureAgentDiagnostics(kit, agents);
    const journals = [];
    for (const agent of diagnostics) {
        if (!Array.isArray(agent.turns)) {
            continue;
        }
        for (const turn of agent.turns) {
            try {
                const evidence = await kit.trpc('agent.executionJournal', {
                    agentId: agent.agentId,
                    runId: turn.runId,
                    serverId: kit.serverId,
                });
                journals.push({ agentId: agent.agentId, runId: turn.runId, evidence });
            } catch (error) {
                errors.push({ runId: turn.runId, error: String(error) });
            }
        }
    }
    return { chats, diagnostics, journals, errors };
}

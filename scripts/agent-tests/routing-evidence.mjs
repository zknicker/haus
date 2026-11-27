import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { captureAgentDiagnostics } from './report.mjs';

/**
 * Preserve every destination and resumed journal before the runner retires its Agents.
 *
 * The grader reads the first provisioned Agent in the first tracked chat. A scenario whose
 * graded Agent is created during the run (a Task's agent) or whose request lands in a chat it
 * opens later names them with `evidence.grade({ agent, rootChatId })`, and a Task chat that did
 * not start from a tracked chat with `evidence.taskChat(chatId)`.
 */
export function withRoutingEvidence(run) {
    return async (context) => {
        const graded = { agents: [], rootChatId: null, taskChatIds: new Set() };
        const evidence = {
            grade: ({ agent, rootChatId = null }) => {
                graded.agents.unshift({ id: agent.id });
                graded.rootChatId = rootChatId ?? graded.rootChatId;
            },
            taskChat: (chatId) => graded.taskChatIds.add(chatId),
        };
        try {
            return await run({ ...context, evidence });
        } finally {
            const captured = await captureRoutingEvidence(context.kit, [
                ...graded.agents,
                ...context.agents,
            ]);
            const directory = path.join('.context/agent-tests/evidence', context.kit.stamp);
            await mkdir(directory, { recursive: true });
            const file = path.join(directory, `${context.kit.scenarioName}.json`);
            const record = {
                ...captured,
                ...(graded.rootChatId ? { rootChatId: graded.rootChatId } : {}),
                taskChatIds: [...graded.taskChatIds],
            };
            await writeFile(file, `${JSON.stringify(record, null, 4)}\n`);
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
            const tasks = [];
            do {
                const page = await kit.trpc('chat.messages', {
                    chatId,
                    serverId: kit.serverId,
                    limit: 100,
                    ...(beforeSequence ? { beforeSequence } : {}),
                });
                messages.push(...page.messages);
                for (const task of page.tasks ?? []) {
                    tasks.push({
                        chatId: task.chatId,
                        originMessageId: task.originMessageId,
                        taskId: task.taskId,
                    });
                    pending.add(task.chatId);
                }
                beforeSequence = page.nextBeforeSequence;
            } while (beforeSequence);
            chats.push({ chatId, messages, tasks });
        } catch (error) {
            errors.push({ chatId, error: String(error) });
        }
    }
    const diagnostics = await captureAgentDiagnostics(kit, uniqueById(agents));
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

function uniqueById(agents) {
    return [...new Map(agents.map((agent) => [agent.id, agent])).values()];
}

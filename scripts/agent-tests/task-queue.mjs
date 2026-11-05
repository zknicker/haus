// Evidence for an Agent working a queue of board Tasks. The Server keeps where each Task
// ended up, not the order it got there, so the order comes from the execution journal.

/** The Agent's tool calls across a settled turn's runs, oldest first. */
export async function journalTools(kit, agentId, turn, { attempts = 10, delayMs = 3000 } = {}) {
    const tools = [];
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
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        if (result?.status !== 'available') {
            throw new Error(
                `Execution journal for run ${runId} stayed ${result?.status ?? 'unreadable'}; the queue evidence is unavailable.`
            );
        }
        tools.push(...result.journal.tools);
    }
    return tools.sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
}

/**
 * The completed card moves and the message sends, in order. `columns` maps a lowercased
 * column name to its category; a refused move changed nothing, so only completed calls count.
 */
export function queueSteps(tools, columns) {
    return tools.flatMap((tool) => {
        const command = String(tool.input?.command ?? '');
        if (tool.status !== 'completed') {
            return [];
        }
        const sends = [...command.matchAll(/\bhaus message send\b/gu)].map(() => ({
            kind: 'send',
        }));
        const moves = [...command.matchAll(/\bhaus task move\b[^\n;&|]*/gu)].flatMap(([text]) => {
            const key = /\b[A-Z][A-Z0-9]{1,4}-[1-9]\d*\b/u.exec(text)?.[0];
            const column = /--column\s+(?:"([^"]+)"|'([^']+)'|(\S+))/u.exec(text);
            const name = column?.[1] ?? column?.[2] ?? column?.[3] ?? '';
            const category = columns.get(name.toLowerCase());
            return key && category
                ? [{ category, key, kind: 'move', output: toolOutput(tool) }]
                : [];
        });
        return [...moves, ...sends];
    });
}

/**
 * What the steps prove: the most cards active at once, the order Tasks started and finished,
 * which finished without ever going active, each finish's receipt, and the sends that came
 * before the last finish, which is chatter however it is worded.
 */
export function paceOf(steps) {
    const active = new Set();
    const started = [];
    const finished = [];
    const receipts = [];
    const skippedActive = [];
    let mostActive = 0;
    let sends = 0;
    let sendsSinceFinish = 0;
    for (const step of steps) {
        if (step.kind === 'send') {
            sends += 1;
            sendsSinceFinish += 1;
            continue;
        }
        if (step.category === 'active') {
            active.add(step.key);
            started.push(step.key);
            mostActive = Math.max(mostActive, active.size);
        } else if (step.category === 'done') {
            if (!active.delete(step.key)) {
                skippedActive.push(step.key);
            }
            finished.push(step.key);
            receipts.push(step.output);
            sendsSinceFinish = 0;
        }
    }
    return {
        finished,
        mostActive,
        receipts,
        sends,
        sendsBeforeLastFinish: sends - sendsSinceFinish,
        skippedActive,
        started,
    };
}

function toolOutput(tool) {
    const output = tool.output ?? tool.final?.output ?? '';
    return typeof output === 'string' ? output : JSON.stringify(output);
}

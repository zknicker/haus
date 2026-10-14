import type { ClaudeController, ClaudeControllerEvent } from './controller.ts';
import type { ClaudeInterruptIntent, ClaudeInterruptJournal } from './interrupt-journal.ts';

/** Interrupt halts foreground turns; native background tasks need their own correlated stop. */
export async function reconcileClaudeTasks(
    journal: ClaudeInterruptJournal,
    intent: ClaudeInterruptIntent,
    events: ClaudeControllerEvent[],
    controller: ClaudeController,
    signal?: AbortSignal
): Promise<boolean> {
    const ids = new Set([
        ...intent.activeTasks,
        ...events.filter((event) => event.task).map((event) => event.task?.id ?? ''),
    ]);
    let complete = true;
    for (const taskId of ids) {
        const latest = events.find((event) => event.task?.id === taskId);
        let stop = await journal.task(taskId);
        const terminal = latest?.task?.terminal === true;
        if (terminal && !stop) {
            continue;
        }
        stop ??= await journal.admitTask(taskId);
        const receipt = events.find((event) => event.requestId === stop.requestId);
        if (receipt && !receipt.success) {
            throw new Error('Native Claude refused to stop a background task.');
        }
        if (terminal && receipt?.success) {
            continue;
        }
        complete = false;
        if (!receipt && (await journal.dispatchTask(taskId))) {
            await controller.stopTask(intent.sessionId, stop, signal);
        }
    }
    return complete;
}

import type { ChatMessage } from './chat.ts';
import { formatWorkerLink } from './worker-link.ts';
import { work } from './worker-record-fixture.ts';
import { type Worker, workerTitleMaxLength, workerSchema } from './worker-shared.ts';
import type { ActiveWorkerLocation } from './worker.ts';

/**
 * Shared Worker link fixtures (ADR 0044). Server, App, and Computer
 * slices build against these so every surface agrees on one link shape.
 */
export const linkedWork: Worker = workerSchema.parse(work);

/**
 * Title → written label → parsed label. The migration's SQL mirror of
 * `formatWorkerLink` must produce `label` for each `title`.
 */
export const workerLinkLabelCases = [
    { title: 'Fix the flaky delivery test', label: 'Fix the flaky delivery test' },
    { title: 'Close ] the bracket]', label: 'Close  the bracket' },
    { title: 'Line one\r\nLine two\nthree', label: 'Line one Line two three' },
    { title: 'C:\\path\\to', label: 'C:\\\\path\\\\to' },
    { title: 'Open [draft', label: 'Open \\[draft' },
    { title: 'trailing\\', label: 'trailing\\\\' },
    { title: 'Café 修正 🚀 ✓', label: 'Café 修正 🚀 ✓' },
    { title: ']]]', label: 'Worker' },
    { title: ' \r\n ', label: 'Worker' },
    { title: 'x'.repeat(workerTitleMaxLength), label: 'x'.repeat(workerTitleMaxLength) },
    {
        title: '\\'.repeat(workerTitleMaxLength),
        label: '\\\\'.repeat(workerTitleMaxLength),
    },
] as const;

export const linkedWorkLink = formatWorkerLink(linkedWork.title, linkedWork.id);

/** A `text` launch Message after ADR 0044: authored words, then the trusted link. */
export const linkedMessage: ChatMessage = {
    attachments: [],
    author: { agentId: linkedWork.agentId, kind: 'agent' },
    body: { kind: 'text' },
    chatId: 'cht_product',
    workers: [linkedWork],
    content: `On it, sending this to a Worker.\n\n${linkedWorkLink}`,
    createdAt: linkedWork.createdAt,
    driveCitations: [],
    id: 'msg_1234567890abcdef',
    imageGenerations: [],
    nonce: 'nonce_worker_launch',
    reactions: [],
    reply: null,
    runId: 'run_launch',
    sequence: 7,
    serverId: 'srv_studio',
    sessionGeneration: 1,
    taskLinks: [],
};

/** "Happening now"'s `location`: the Worker's Task. */
export const activeWorkLocations = {
    task: {
        chatId: 'cht_task_sec_12',
        kind: 'task',
        taskId: 'tsk_1234567890abcdef',
    },
} as const satisfies Record<string, ActiveWorkerLocation>;

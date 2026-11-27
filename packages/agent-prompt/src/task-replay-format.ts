import { TASK_REPLAY_MAX_CHARS, type TaskReplay, type TaskReplayMessage } from '@haus/api';

const opening =
    'This session is new, so you start from your chat so far, oldest first. The messages that woke you follow it.';

/**
 * A fresh Task session's reread of its chat (specs/tasks.md#archive): the brief, always, then the
 * newest messages that fit the character budget, cut from the oldest end. Null when there is nothing
 * before the messages that woke it.
 */
export function composeTaskReplay(replay: TaskReplay) {
    const kept = newestWithin(replay.messages, TASK_REPLAY_MAX_CHARS);
    if (kept.length === 0 && !replay.brief) {
        return null;
    }
    const oldestKept = kept[0]?.sequence;
    const gap =
        kept.length < replay.messages.length ||
        (replay.brief !== null &&
            oldestKept !== undefined &&
            oldestKept > replay.brief.sequence + 1);
    return [
        `[Haus task history] ${opening}`,
        ...(replay.brief ? [formatMessage(replay.brief, 'brief')] : []),
        ...(gap ? ['(earlier messages left out)'] : []),
        ...kept.map((message) => formatMessage(message, null)),
    ].join('\n');
}

function newestWithin(messages: readonly TaskReplayMessage[], budget: number) {
    const kept: TaskReplayMessage[] = [];
    let chars = 0;
    for (const message of [...messages].reverse()) {
        chars += message.body.length;
        if (chars > budget) {
            break;
        }
        kept.unshift(message);
    }
    return kept;
}

function formatMessage(message: TaskReplayMessage, label: string | null) {
    const head = `[msg=${message.id} time=${message.createdAt}${label ? ` ${label}` : ''}] @${message.author}:`;
    return `${head} ${message.body.trim().replaceAll('\n', '\n  ')}`;
}

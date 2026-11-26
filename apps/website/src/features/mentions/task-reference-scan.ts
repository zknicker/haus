import { parseTaskReferenceTarget, type TaskLink } from '@haus/api';
import type { Mention } from './mention-types.ts';

/**
 * A message's Task references as mentions. The Server resolved them when the
 * message was written (`message.taskLinks`), so this never decides what is a
 * Task: an explicit `task://` link, by full id or short id, gains the Task's id
 * and short id. A bare code like `GEN-12` names an Issue, never a Task.
 */
export function applyTaskLinks(
    mentions: readonly Mention[],
    taskLinks: readonly TaskLink[] | undefined
): readonly Mention[] {
    if (!taskLinks || taskLinks.length === 0) {
        return mentions;
    }
    return mentions.map((mention) => {
        const ref = mention.kind === 'task' ? parseTaskReferenceTarget(mention.id) : null;
        const link = ref
            ? taskLinks.find((candidate) => candidate.taskId === ref || candidate.shortId === ref)
            : undefined;
        return link
            ? {
                  ...mention,
                  metadata: { ...mention.metadata, taskId: link.taskId, taskShortId: link.shortId },
              }
            : mention;
    });
}

/** A Task chip's full id and short id, when the mention carries them. */
export function readTaskLink(metadata: Record<string, unknown> | undefined) {
    const taskId = typeof metadata?.taskId === 'string' ? metadata.taskId : undefined;
    const shortId = typeof metadata?.taskShortId === 'string' ? metadata.taskShortId : undefined;
    return { shortId, taskId };
}

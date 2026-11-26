import { formatTaskReferenceTarget, type Task } from '@haus/api';
import { toast } from '@heroui/react';
import { writeClipboardText } from '../../lib/clipboard.ts';

/** A `task://` link is the reference: pasted into a message, the Server links it to the Task. */
export function copyTaskReference(task: Pick<Task, 'id' | 'shortId' | 'title'>) {
    writeClipboardText(`[${task.title}](${formatTaskReferenceTarget(task.id)})`)
        .then(() => toast.success(`${task.shortId} copied`))
        .catch(() => toast.danger('Could not copy the reference'));
}

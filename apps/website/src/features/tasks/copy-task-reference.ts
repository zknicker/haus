import { formatTaskReferenceTarget, type Task } from '@haus/api';
import { toast } from '@heroui/react';
import { writeClipboardText } from '../../lib/clipboard.ts';

export function copyTaskReference(task: Pick<Task, 'id' | 'shortId' | 'title'>) {
    writeClipboardText(taskReferenceMarkdown(task))
        .then(() => toast.success(`${task.shortId} copied`))
        .catch(() => toast.danger('Could not copy the reference'));
}

export function taskReferenceMarkdown(task: Pick<Task, 'id' | 'title'>) {
    return `[${escapeLinkLabel(task.title)}](${formatTaskReferenceTarget(task.id)})`;
}

function escapeLinkLabel(label: string) {
    return label.replaceAll(/[\\[\]]/gu, (match) => `\\${match}`);
}

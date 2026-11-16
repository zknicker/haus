import { toast } from '@heroui/react';
import { writeClipboardText } from '../../lib/clipboard.ts';

/** The bare key is the reference: pasted into a message, the Server links it to the Task. */
export function copyTaskReference(taskKey: string) {
    writeClipboardText(taskKey)
        .then(() => toast.success(`${taskKey} copied`))
        .catch(() => toast.danger('Could not copy the reference'));
}

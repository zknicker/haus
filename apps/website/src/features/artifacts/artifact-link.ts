import { toast } from '@heroui/react';
import { writeClipboardText } from '../../lib/clipboard.ts';

/** Copies an artifact address and confirms it, the way every copy action in the library does. */
export async function copyArtifactLink(url: string, title = 'Link copied') {
    try {
        await writeClipboardText(url);
        toast.success(title);
    } catch (error) {
        toast.danger('Could not copy the link', {
            description: error instanceof Error ? error.message : undefined,
        });
    }
}

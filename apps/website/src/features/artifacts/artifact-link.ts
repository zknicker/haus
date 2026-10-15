import { toast } from '@heroui/react';
import { writeClipboardText } from '../../lib/clipboard.ts';

/** Copies an artifact address and confirms it, the way every copy action in the library does. */
export async function copyArtifactLink(url: string, title = 'Link copied') {
    await copyArtifactText(url, title, 'Could not copy the link');
}

/** Copies a drive path (`designs/KEY-100/final.png`), the form `haus files` takes. */
export async function copyArtifactPathText(path: string) {
    await copyArtifactText(path, 'Path copied', 'Could not copy the path');
}

async function copyArtifactText(text: string, title: string, failure: string) {
    try {
        await writeClipboardText(text);
        toast.success(title);
    } catch (error) {
        toast.danger(failure, {
            description: error instanceof Error ? error.message : undefined,
        });
    }
}

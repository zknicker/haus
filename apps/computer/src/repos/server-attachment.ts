import { basename, dirname } from 'node:path';
import { createAttachmentStore } from '../attachment-store.ts';

export async function readServerAttachment(serverRoot: string) {
    const attachment = await createAttachmentStore(dirname(dirname(serverRoot))).readAttachment(
        basename(serverRoot)
    );
    return attachment?.credential && attachment.serverOrigin ? attachment : null;
}

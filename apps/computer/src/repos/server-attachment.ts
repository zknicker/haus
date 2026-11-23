import { basename, dirname } from 'node:path';
import { createAttachmentStore } from '../attachment-store.ts';

/** The attachment a `<dataRoot>/servers/<serverId>` folder holds, or null once it is gone. */
export async function readServerAttachment(serverRoot: string) {
    const attachment = await createAttachmentStore(dirname(dirname(serverRoot))).readAttachment(
        basename(serverRoot)
    );
    return attachment?.credential && attachment.serverOrigin ? attachment : null;
}

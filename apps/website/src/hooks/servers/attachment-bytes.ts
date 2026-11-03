import { getAppSessionAccessToken } from '../../lib/app-auth.tsx';
import { getHausServerOrigin } from '../../lib/haus-server.tsx';

/**
 * A download that did not return bytes. `retryable` separates a moment (no
 * session token yet, a 5xx, a dropped connection, a 403 while the message that
 * publishes the attachment is still landing) from an answer (the id is gone).
 */
export class AttachmentFetchError extends Error {
    constructor(
        message: string,
        readonly retryable: boolean
    ) {
        super(message);
        this.name = 'AttachmentFetchError';
    }
}

export async function fetchAttachmentBlob({
    attachmentId,
    serverId,
    signal,
}: {
    attachmentId: string;
    serverId: string;
    signal?: AbortSignal;
}) {
    const token = getAppSessionAccessToken();
    if (!token) {
        throw new AttachmentFetchError('Sign in to download attachments.', true);
    }

    let response: Response;
    try {
        response = await fetch(
            new URL(`/attachments/${serverId}/${attachmentId}`, getHausServerOrigin()),
            {
                headers: { authorization: `Bearer ${token}` },
                signal,
            }
        );
    } catch (cause) {
        if (signal?.aborted) {
            throw cause;
        }
        throw new AttachmentFetchError('Could not reach the Server for that attachment.', true);
    }
    if (!response.ok) {
        throw new AttachmentFetchError(
            'Could not download that attachment.',
            response.status !== 404
        );
    }

    return response.blob();
}

export function isRetryableAttachmentError(error: unknown) {
    return error instanceof AttachmentFetchError && error.retryable;
}

export function saveAttachmentBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.download = filename;
    anchor.href = url;
    anchor.click();
    URL.revokeObjectURL(url);
}

import type { ExecutionJournalSink } from '../harness/execution-journal.ts';
import { computerKnownSecrets } from './journal-redaction.ts';
import { ExecutionJournalUploader } from './journal-uploader.ts';

/**
 * One uploader per attached Server for the daemon's life, so its outbox and
 * resend state outlive a reconnect. A turn finds its Server's uploader here.
 */
const uploaders = new Map<string, ExecutionJournalUploader>();

/**
 * The attached Server's uploader, told when this attachment socket closes.
 */
export function attachmentJournalUploads(
    dataRoot: string,
    attachment: { credential: string; serverId: string },
    daemonWork: { send(frame: unknown): boolean },
    socket: WebSocket
): ExecutionJournalUploader {
    let uploader = uploaders.get(attachment.serverId);
    if (!uploader) {
        uploader = new ExecutionJournalUploader({
            dataRoot,
            knownSecrets: computerKnownSecrets(attachment.credential, process.env),
            send: (frame) => daemonWork.send(frame),
            serverId: attachment.serverId,
        });
        uploaders.set(attachment.serverId, uploader);
    }
    const bound = uploader;
    socket.addEventListener('close', () => bound.disconnected(), { once: true });
    return bound;
}

/** The sink a run's journal syncs through; none when its Server is not attached. */
export async function journalSinkFor(input: {
    agentId: string;
    agentRoot: string;
    runId: string;
    serverId: string;
}): Promise<ExecutionJournalSink | undefined> {
    return await uploaders.get(input.serverId)?.journalSink(input);
}

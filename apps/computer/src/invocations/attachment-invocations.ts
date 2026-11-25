import { join } from 'node:path';
import { agentFenceCommandSchema, invocationCommandSchemas } from '@haus/api';
import { sendAgentHeld } from '../agent-held.ts';
import { agentDesktopToolsRoot } from '../desktop/agent-desktop-binary.ts';
import { driveSyncFrames } from '../drive/drive-sync-frames.ts';
import { bashRunner } from './bash.ts';
import { createBrowserRunner } from './browser.ts';
import { createDesktopRunner } from './desktop.ts';
import { editRunner } from './editor.ts';
import { fileReadRunner, fileWriteRunner, viewImageRunner } from './files.ts';
import { createInvocationHandler } from './handler.ts';
import type { InvocationHandler } from './operation.ts';
import { createInvocationPayloads } from './payloads.ts';
import { createRepoCheckoutRunner } from './repo-checkout.ts';

interface AttachmentInvocations {
    connected: () => void;
    disconnected: () => void;
    fence: (agentId: string) => Promise<void>;
    receive: (frame: unknown) => boolean;
}

type Arrival =
    | { kind: 'connected' }
    | { kind: 'disconnected' }
    | { agentId: string; fenced: () => void; kind: 'fence' }
    | { frame: unknown; kind: 'frame' };

const frameTypes = new Set<unknown>([
    ...invocationCommandSchemas.map((schema) => schema.shape.type.value),
    agentFenceCommandSchema.shape.type.value,
]);

const attachments = new Map<string, AttachmentInvocations>();

export function attachmentInvocations(
    dataRoot: string,
    attachment: { credential: string; serverId: string; serverOrigin: string },
    daemonWork: {
        send(frame: unknown): boolean;
        track<Result>(operation: Promise<Result>): Promise<Result>;
    }
) {
    const existing = attachments.get(attachment.serverId);
    if (existing) {
        return existing;
    }
    const serverRoot = join(dataRoot, 'servers', attachment.serverId);
    const driveSync = driveSyncFrames(join(serverRoot, 'agents'), attachment, {
        track: (operation) => daemonWork.track(operation),
    });
    let handler: InvocationHandler | null = null;
    const arrivals: Arrival[] = [];
    const deliver = (ready: InvocationHandler, arrival: Arrival) => {
        if (arrival.kind === 'frame') {
            ready.receive(arrival.frame);
            return;
        }
        if (arrival.kind === 'fence') {
            void ready.fence(arrival.agentId).then(arrival.fenced);
            return;
        }
        if (arrival.kind === 'disconnected') {
            ready.disconnected();
            return;
        }
        void ready.connected().catch(logFailure);
    };
    const created: AttachmentInvocations = {
        connected: () => {
            void sendAgentHeld(
                (frame) => daemonWork.send(frame),
                dataRoot,
                attachment.serverId
            ).catch(logFailure);
            if (handler) {
                deliver(handler, { kind: 'connected' });
                return;
            }
            arrivals.push({ kind: 'connected' });
        },
        disconnected: () => {
            if (handler) {
                deliver(handler, { kind: 'disconnected' });
                return;
            }
            arrivals.push({ kind: 'disconnected' });
        },
        fence: (agentId) => {
            if (handler) {
                return handler.fence(agentId);
            }
            const { promise, resolve } = Promise.withResolvers<void>();
            arrivals.push({ agentId, fenced: resolve, kind: 'fence' });
            return promise;
        },
        receive: (frame) => {
            if (driveSync.receive(frame)) {
                return true;
            }
            if (!isInvocationFrame(frame)) {
                return false;
            }
            if (handler) {
                handler.receive(frame);
                return true;
            }
            arrivals.push({ frame, kind: 'frame' });
            return true;
        },
    };
    attachments.set(attachment.serverId, created);
    createInvocationHandler({
        agentsRoot: join(serverRoot, 'agents'),
        payloadsFor: (invocationId) =>
            createInvocationPayloads({
                credential: attachment.credential,
                invocationId,
                serverOrigin: attachment.serverOrigin,
            }),
        runners: {
            bash: bashRunner,
            browser: createBrowserRunner({ browserRoot: join(serverRoot, 'browser') }),
            desktop: createDesktopRunner({ toolsRoot: agentDesktopToolsRoot(dataRoot) }),
            edit: editRunner,
            'file-read': fileReadRunner,
            'file-write': fileWriteRunner,
            'repo-checkout': createRepoCheckoutRunner(join(serverRoot, 'agents')),
            'view-image': viewImageRunner,
        },
        send: (frame) => daemonWork.send(frame),
    }).then(
        (ready) => {
            handler = ready;
            for (const arrival of arrivals.splice(0)) {
                deliver(ready, arrival);
            }
        },
        (error) => {
            attachments.delete(attachment.serverId);
            for (const arrival of arrivals.splice(0)) {
                if (arrival.kind === 'fence') {
                    arrival.fenced();
                }
            }
            logFailure(error);
        }
    );
    return created;
}

function isInvocationFrame(frame: unknown) {
    return (
        typeof frame === 'object' && frame !== null && 'type' in frame && frameTypes.has(frame.type)
    );
}

function logFailure(error: unknown) {
    console.error(error instanceof Error ? error.message : error);
}

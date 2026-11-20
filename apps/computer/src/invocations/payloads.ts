import { createHash } from 'node:crypto';
import {
    type InvocationBytes,
    invocationInlineBytesMax,
    invocationPayloadReferenceSchema,
} from '@haus/api';
import { type InvocationPayloads, inlinePayloads } from './operation.ts';

const storedPayloadSchema = invocationPayloadReferenceSchema.omit({ kind: true });

export function createInvocationPayloads(input: {
    credential: string;
    invocationId: string;
    serverOrigin: string;
}) {
    const collection = new URL(
        `/computer/invocations/${encodeURIComponent(input.invocationId)}/payloads`,
        input.serverOrigin
    );
    const authorization = `Bearer ${input.credential}`;
    const payloads: InvocationPayloads = {
        fetch: async (bytes, signal) => {
            if (bytes.kind === 'inline') {
                return await inlinePayloads.fetch(bytes, signal);
            }
            return await download(
                bytes,
                `${collection}/${encodeURIComponent(bytes.attachmentId)}`,
                signal
            );
        },
        store: async (bytes, mediaType, signal) => {
            if (bytes.byteLength <= invocationInlineBytesMax) {
                return await inlinePayloads.store(bytes, mediaType, signal);
            }
            const sha256 = digest(bytes);
            const response = await fetch(collection, {
                body: bytes,
                headers: { authorization, 'content-type': mediaType },
                method: 'PUT',
                signal,
            });
            if (!response.ok) {
                throw new Error(
                    `The Server refused the invocation payload (HTTP ${response.status}).`
                );
            }
            const stored = storedPayloadSchema.parse(await response.json());
            if (stored.sha256 !== sha256 || stored.sizeBytes !== bytes.byteLength) {
                throw new Error('The Server stored different bytes than this Computer uploaded.');
            }
            return { ...stored, kind: 'attachment' as const };
        },
    };
    return payloads;

    async function download(
        reference: Extract<InvocationBytes, { kind: 'attachment' }>,
        url: string,
        signal: AbortSignal
    ) {
        const response = await fetch(url, { headers: { authorization }, signal });
        if (!response.ok) {
            throw new Error(
                `The invocation payload could not be downloaded (HTTP ${response.status}).`
            );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== reference.sizeBytes || digest(bytes) !== reference.sha256) {
            throw new Error('The downloaded invocation payload does not match its reference.');
        }
        return bytes;
    }
}

function digest(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex');
}

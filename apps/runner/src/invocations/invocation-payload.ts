import { createHash } from 'node:crypto';
import {
    type DispatchKey,
    type InvocationBytes,
    type InvocationPayloadReference,
    type InvocationResultFrame,
    invocationInlineBytesMax,
    invocationPayloadReferenceSchema,
} from '@haus/api';
import type { RunAuthority } from '../run-context.ts';

const storedPayloadSchema = invocationPayloadReferenceSchema.omit({ kind: true });

export async function readInvocationPayload(
    authority: RunAuthority,
    reference: InvocationPayloadReference,
    signal?: AbortSignal
) {
    const response = await fetch(
        new URL(
            `/api/agent/invocation-payloads/${encodeURIComponent(reference.attachmentId)}`,
            authority.serverUrl
        ),
        { headers: { authorization: `Bearer ${authority.runCredential}` }, signal }
    );
    if (!response.ok) {
        throw new Error(`The Server refused the payload read (HTTP ${response.status}).`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== reference.sizeBytes || digest(bytes) !== reference.sha256) {
        throw new Error('The payload the Server returned does not match its reference.');
    }
    return { bytes, mediaType: reference.mediaType };
}

export async function fileWriteBytes(
    authority: RunAuthority,
    key: Pick<DispatchKey, 'seq' | 'toolCallId'>,
    bytes: Uint8Array,
    signal: AbortSignal
) {
    const mediaType = 'application/octet-stream';
    if (bytes.byteLength > invocationInlineBytesMax) {
        return await uploadInvocationPayload(authority, key, { bytes, mediaType }, signal);
    }
    const inline: InvocationBytes = {
        base64: Buffer.from(bytes).toString('base64'),
        kind: 'inline',
        mediaType,
    };
    return inline;
}

export async function uploadInvocationPayload(
    authority: RunAuthority,
    key: Pick<DispatchKey, 'seq' | 'toolCallId'>,
    payload: { bytes: Uint8Array; mediaType: string },
    signal: AbortSignal
) {
    const url = new URL('/api/agent/invocation-payloads', authority.serverUrl);
    url.searchParams.set('toolCallId', key.toolCallId);
    url.searchParams.set('seq', String(key.seq));
    const response = await fetch(url, {
        body: payload.bytes,
        headers: {
            authorization: `Bearer ${authority.runCredential}`,
            'content-type': payload.mediaType,
        },
        method: 'PUT',
        signal,
    });
    if (!response.ok) {
        throw new Error(`The Server refused the payload upload (HTTP ${response.status}).`);
    }
    const stored = storedPayloadSchema.parse(await response.json());
    if (stored.sha256 !== digest(payload.bytes) || stored.sizeBytes !== payload.bytes.byteLength) {
        throw new Error('The Server stored different bytes than the runner uploaded.');
    }
    const reference: InvocationPayloadReference = { ...stored, kind: 'attachment' };
    return reference;
}

export async function inlineInvocationPayload(
    authority: RunAuthority,
    frame: InvocationResultFrame,
    signal?: AbortSignal
) {
    const { output } = frame;
    if (output.kind !== 'attachment') {
        return frame;
    }
    try {
        const payload = await readInvocationPayload(authority, output, signal);
        const inlined: InvocationResultFrame = {
            ...frame,
            output: {
                base64: Buffer.from(payload.bytes).toString('base64'),
                kind: 'inline',
                mediaType: payload.mediaType,
            },
        };
        return inlined;
    } catch (error) {
        const unread: InvocationResultFrame = {
            ...frame,
            output: {
                kind: 'text',
                text: `The machine stored ${output.sizeBytes} bytes of ${output.mediaType}, but they could not be read: ${error instanceof Error ? error.message : String(error)}`,
            },
        };
        return unread;
    }
}

function digest(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex');
}

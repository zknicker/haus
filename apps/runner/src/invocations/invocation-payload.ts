import { createHash } from 'node:crypto';
import type { InvocationPayloadReference, InvocationResultFrame } from '@haus/api';
import type { RunAuthority } from '../run-context.ts';

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
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== reference.sizeBytes || sha256 !== reference.sha256) {
        throw new Error('The payload the Server returned does not match its reference.');
    }
    return { bytes, mediaType: reference.mediaType };
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

import * as z from 'zod';

/** A Server-confirmed send: the Chat it landed in, when shown, and whether it carried `--done`. */
export interface CommittedSend {
    chatId: string | null;
    done: boolean;
}

/** The committed send a proxied request made, or null when it was held or refused. */
export function committedSend(requestBody: string, responseBody: string): CommittedSend | null {
    const response = z
        .object({
            message: z.object({ chat_id: z.string().min(1) }).optional(),
            state: z.literal('sent'),
        })
        .safeParse(parseJson(responseBody));
    if (!response.success) {
        return null;
    }
    const request = z.object({ done: z.literal(true) }).safeParse(parseJson(requestBody));
    return { chatId: response.data.message?.chat_id ?? null, done: request.success };
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

const preCommitFailureCodes = new Set([
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'ConnectionRefused',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

export function isDefinitelyPreCommitFailure(error: unknown): boolean {
    let current = error;
    for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
        if ('code' in current && preCommitFailureCodes.has(String(current.code))) {
            return true;
        }
        current = 'cause' in current ? current.cause : null;
    }
    return false;
}

/** One-pixel PNG: deterministic bytes, so no test ever reaches a real provider. */
export const deterministicPng = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
    )
);

export type AvatarProviderMode = 'fail' | 'success' | 'unavailable';

import * as z from 'zod';

// One avatar vocabulary for every identity — agents and people alike. An
// avatar is a square image the user uploads, or nothing at all (surfaces then
// fall back to initials).
export const avatarMediaTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AvatarMediaType = (typeof avatarMediaTypes)[number];

export const avatarMediaTypeSchema = z.enum(avatarMediaTypes);

/** Upload ceiling, checked after the client resize. */
export const avatarMaxBytes = 512 * 1024;

/** Clients resize to this square before upload; nothing stores the original. */
export const avatarPixelSize = 256;

export const avatarAcceptedTypesLabel = 'JPEG, PNG, or WebP';

export const avatarIdSchema = z.string().regex(/^avt_[a-z0-9]{16}$/u);

export type AvatarId = z.infer<typeof avatarIdSchema>;

export function isAvatarId(value: unknown): value is AvatarId {
    return avatarIdSchema.safeParse(value).success;
}

export function isAvatarMediaType(value: string): value is AvatarMediaType {
    return (avatarMediaTypes as readonly string[]).includes(value);
}

export function formatAvatarMaxBytes(bytes: number = avatarMaxBytes): string {
    if (bytes > 0 && bytes % (1024 * 1024) === 0) {
        return `${bytes / (1024 * 1024)} MiB`;
    }
    if (bytes > 0 && bytes % 1024 === 0) {
        return `${bytes / 1024} KiB`;
    }
    return `${bytes} bytes`;
}

export function avatarUnsupportedMediaTypeMessage(): string {
    return `Choose a ${avatarAcceptedTypesLabel} image.`;
}

export function avatarTooLargeMessage(): string {
    return `An avatar image must be ${formatAvatarMaxBytes()} or smaller.`;
}

export function avatarUploadHint(): string {
    return `${avatarAcceptedTypesLabel} · up to ${formatAvatarMaxBytes()} after resize to ${avatarPixelSize}×${avatarPixelSize}.`;
}

const idSchema = z.string().trim().min(1);

export const avatarBase64MaxLength = 4 * Math.ceil(avatarMaxBytes / 3);

export const avatarBytesInputSchema = z
    .object({
        bytesBase64: z
            .string()
            .min(1)
            .max(avatarBase64MaxLength)
            .regex(/^[A-Za-z0-9+/]+={0,2}$/u, 'Avatar bytes must be base64.'),
        mediaType: avatarMediaTypeSchema,
    })
    .strict();

export type AvatarBytesInput = z.infer<typeof avatarBytesInputSchema>;

export const avatarTargetSchema = z.discriminatedUnion('kind', [
    z.object({ agentId: idSchema, kind: z.literal('agent') }).strict(),
    z.object({ kind: z.literal('user') }).strict(),
]);

export type AvatarTarget = z.infer<typeof avatarTargetSchema>;

export const setAvatarInputSchema = avatarBytesInputSchema
    .extend({
        serverId: idSchema,
        target: avatarTargetSchema,
    })
    .strict();

export type SetAvatarInput = z.infer<typeof setAvatarInputSchema>;

export const clearAvatarInputSchema = z
    .object({ serverId: idSchema, target: avatarTargetSchema })
    .strict();

export type ClearAvatarInput = z.infer<typeof clearAvatarInputSchema>;

/** `avatarUrl` is null only after clearing; it always matches `avatarId`. */
export const avatarSchema = z
    .object({ avatarId: avatarIdSchema.nullable(), avatarUrl: z.string().nullable() })
    .strict();

export type Avatar = z.infer<typeof avatarSchema>;

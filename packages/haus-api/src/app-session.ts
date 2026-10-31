import * as z from 'zod';
import { runtimeUserIdSchema } from './runtime/identity.ts';

export const appSessionSchema = z.object({
    accessToken: z.string().min(1),
    expiresAt: z.string().datetime(),
    issuedAt: z.string().datetime(),
    sessionId: z.string().min(1),
    user: z.object({
        avatarId: z.string().nullable(),
        displayName: z.string().nullable(),
        email: z.string().nullable(),
        id: runtimeUserIdSchema,
    }).strict(),
}).strict();

export const nativeAppClientSchema = z.enum(['desktop', 'ios']);

export const nativeAppSessionRequestSchema = z.object({
    client: nativeAppClientSchema,
    sessionToken: z.string().min(1).optional(),
}).strict();

// Resuming this session also requires fresh Cloudflare admission for its owner.
export const nativeAppSessionSchema = z.object({
    session: appSessionSchema,
    sessionExpiresAt: z.string().datetime(),
    sessionToken: z.string().min(1),
}).strict();

export const appAuthConfigSchema = z.object({
    clientId: z.string().min(1),
    issuer: z.url(),
    redirectUri: z.url(),
    resource: z.url(),
}).strict();

export const appAuthErrorSchema = z.object({
    error: z.enum([
        'auth_required',
        'auth_expired',
        'auth_revoked',
        'auth_invalid_grant',
        'auth_unavailable',
    ]),
    message: z.string(),
}).strict();

export type AppSession = z.infer<typeof appSessionSchema>;
export type NativeAppClient = z.infer<typeof nativeAppClientSchema>;
export type NativeAppSessionRequest = z.infer<typeof nativeAppSessionRequestSchema>;
export type NativeAppSession = z.infer<typeof nativeAppSessionSchema>;
export type AppAuthConfig = z.infer<typeof appAuthConfigSchema>;
export type AppAuthError = z.infer<typeof appAuthErrorSchema>;

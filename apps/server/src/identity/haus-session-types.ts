import type { AppSession, NativeAppClient, NativeAppSession } from '@haus/api/app-session';
import type { CloudflareAdmission } from './cloudflare-access.ts';

export type HausAuthErrorCode =
    | 'auth_required'
    | 'auth_expired'
    | 'auth_revoked'
    | 'auth_invalid_grant'
    | 'auth_unavailable';

export class HausAuthError extends Error {
    constructor(
        readonly code: HausAuthErrorCode,
        message: string
    ) {
        super(message);
        this.name = 'HausAuthError';
    }
}

export interface HausSessionIdentity {
    accessTokenExpiresAt: number;
    avatarId: string | null;
    displayName: string | null;
    email: string | null;
    identitySubject: string;
    sessionExpiresAt: number;
    sessionId: string;
    userId: string;
}

export interface IssuedHausSession {
    appSession: AppSession;
    resumeToken: string;
    sessionExpiresAt: string;
}

export interface HausSessions {
    authenticate(accessToken: string | null): Promise<HausSessionIdentity>;
    create(admission: CloudflareAdmission): Promise<IssuedHausSession>;
    issueDevelopment(userId: string, identitySubject: string): Promise<IssuedHausSession>;
    resume(resumeToken: string | null, admission: CloudflareAdmission): Promise<IssuedHausSession>;
    resumeDevelopment(
        userId: string,
        identitySubject: string,
        resumeToken: string
    ): Promise<IssuedHausSession>;
    resumeNative(
        input: { client: NativeAppClient; sessionToken?: string },
        admission: CloudflareAdmission
    ): Promise<NativeAppSession>;
    revoke(resumeToken: string | null): Promise<string | null>;
}

export interface HausSessionsOptions {
    accessLifetimeMs?: number;
    now?: () => number;
}

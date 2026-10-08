import { z } from 'zod';

/** Only humans may be Owners; a Server always keeps at least one. */
export type ServerRole = 'admin' | 'member' | 'owner';

/**
 * The slug is the globally unique, immutable, human-facing address of a Haus
 * server. It never carries authority — relationships and authorization use the
 * opaque Server id.
 */
export const serverSlugSchema = z
    .string()
    .min(2)
    .max(32)
    .regex(
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u,
        'A Server address uses lowercase letters, numbers, and hyphens.'
    );

export const serverDisplayNameSchema = z.string().trim().min(1).max(64);

export const serverIdSchema = z.string().min(1);

export interface ServerSummary {
    displayName: string;
    id: string;
    role: ServerRole;
    slug: string;
}

export interface ServerChannel {
    id: string;
    name: string;
}

export interface ServerOnboarding {
    agentId: string | null;
    applicationId: string | null;
    channelId: string;
    computerId: string | null;
    failure: null | {
        code:
            | 'computer-disconnected'
            | 'computer-incompatible'
            | 'inventory-empty'
            | 'inventory-invalid'
            | 'application-failed';
        detail: string;
    };
    modelId: string | null;
    phase: 'applying' | 'awaiting-computer' | 'awaiting-cove' | 'complete';
    runtimeId: string | null;
}

export interface ServerDetail extends ServerSummary {
    channels: ServerChannel[];
    onboarding: ServerOnboarding;
    viewerUserId: string;
}

/** The Channel every Haus server creates for its whole membership. */
export const allChannelName = 'all';
/** Seeded on every new `#all`; migration 0068 backfilled the same text. */
export const allChannelDescription = 'General channel for all members and team-wide announcements.';
export const onboardingOwnerChannelName = 'onboarding-owner';

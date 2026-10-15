import { randomBytes } from 'node:crypto';
import type {
    Trigger,
    TriggerFireErrorCode,
    TriggerRequestRefusal,
    TriggerStatus,
    WebhookTrigger,
} from '@haus/api';
import { triggerSecretPrefix } from '@haus/api';
import { hashComputerSecret } from '../computers/service.ts';
import { type GithubTriggerRow, toGithubTriggerView } from '../github/github-trigger-view.ts';
import type { triggersTable } from '../postgres/schema.ts';
import { type LinearTriggerRow, toLinearTriggerView } from './linear-trigger-view.ts';
import { triggerUrl } from './trigger-url.ts';

export interface TriggerClock {
    now(): Date;
}

/** The trigger does not exist, or does not belong to the calling Agent. */
export class TriggerNotFoundError extends Error {
    constructor(message = 'That trigger is not owned by this Agent.') {
        super(message);
        this.name = 'TriggerNotFoundError';
    }
}

/**
 * The trigger exists but cannot take this request right now: it is disabled,
 * its owner or anchor is gone, or it is over its rate limit. The code is the
 * same vocabulary the public route answers with.
 */
export class TriggerRefusedError extends Error {
    constructor(
        readonly code: TriggerFireErrorCode,
        message: string
    ) {
        super(message);
        this.name = 'TriggerRefusedError';
    }
}

/** The caller may not operate triggers in this Server. */
export class TriggerAccessDeniedError extends Error {
    constructor() {
        super('A Server Owner or Admin is required to operate triggers.');
        this.name = 'TriggerAccessDeniedError';
    }
}

/**
 * Mints one bearer secret. The plaintext is returned to the creating Agent
 * exactly once; only the hash is ever stored.
 */
export function mintTriggerSecret(): string {
    return `${triggerSecretPrefix}${randomBytes(32).toString('base64url')}`;
}

export function hashTriggerSecret(secret: string): string {
    return hashComputerSecret(secret);
}

export function readBearerSecret(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value !== 'string' || !value.startsWith('Bearer ')) {
        return null;
    }
    const secret = value.slice(7).trim();
    return secret.startsWith(triggerSecretPrefix) && secret.length > triggerSecretPrefix.length
        ? secret
        : null;
}

/**
 * A well-formed Trigger request the Server will not do, such as rotating a
 * Trigger that has no secret. The message leads with the stable code.
 */
export class TriggerRequestRefusedError extends Error {
    constructor(
        readonly code: TriggerRequestRefusal,
        message: string
    ) {
        super(`${code}: ${message}`);
        this.name = 'TriggerRequestRefusedError';
    }
}

export interface TriggerViewContext {
    createdByHandle: string | null;
    /** The `github` configuration; required exactly when the Trigger is `github`. */
    github: GithubTriggerRow | null;
    /** The `linear` configuration; required exactly when the Trigger is `linear`. */
    linear: LinearTriggerRow | null;
    origin: string;
    ownerHandle: string;
}

/**
 * The wire view of one stored trigger. A webhook's `url` is derived per request
 * rather than stored, so every reader passes the origin the caller reached.
 */
export function toTrigger(
    trigger: typeof triggersTable.$inferSelect,
    context: TriggerViewContext
): Trigger {
    const base = {
        anchorChatId: trigger.anchorChatId,
        anchorMessageId: trigger.anchorMessageId,
        createdAt: trigger.createdAt.toISOString(),
        createdByHandle: trigger.createdByUserId ? context.createdByHandle : null,
        createdByUserId: trigger.createdByUserId,
        disabledAt: trigger.disabledAt?.toISOString() ?? null,
        fireCount: trigger.fireCount,
        id: trigger.id,
        instruction: trigger.instruction,
        lastFiredAt: trigger.lastFiredAt?.toISOString() ?? null,
        ownerAgentId: trigger.ownerAgentId,
        ownerHandle: context.ownerHandle,
        status: trigger.status as TriggerStatus,
        title: trigger.title,
        updatedAt: trigger.updatedAt.toISOString(),
        version: trigger.version,
    };
    if (trigger.kind === 'webhook') {
        return { ...base, kind: 'webhook', url: triggerUrl(context.origin, trigger.id) };
    }
    if (trigger.kind === 'linear') {
        if (!context.linear) {
            throw new Error(`Linear Trigger ${trigger.id} has no stored configuration.`);
        }
        return { ...base, kind: 'linear', linear: toLinearTriggerView(context.linear) };
    }
    if (!context.github) {
        throw new Error(`GitHub Trigger ${trigger.id} has no stored configuration.`);
    }
    return { ...base, github: toGithubTriggerView(context.github), kind: 'github' };
}

/** Narrows to a webhook, the only kind with a URL and a secret. */
export function requireWebhookTrigger(trigger: Trigger): WebhookTrigger {
    if (trigger.kind !== 'webhook') {
        throw new TriggerRequestRefusedError(
            'trigger_has_no_secret',
            `A ${trigger.kind === 'github' ? 'GitHub' : 'Linear'} Trigger has no URL and no secret to rotate.`
        );
    }
    return trigger;
}

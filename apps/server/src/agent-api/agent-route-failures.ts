import type { AgentCreateAgentRequest } from '@haus/api';
import type { AvatarImageService } from '../avatar-generation/service.ts';
import { AvatarGenerationUnavailableError } from '../avatar-generation/service.ts';
import { hashAvatarBytes } from '../avatars/avatar-bytes.ts';
import { AgentAuthorNotFoundError } from '../chats/agent-authored-message.ts';
import { ChatArchivedError } from '../chats/chat-access.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import { AgentConfigDeniedError } from '../server-agents/agent-config-errors.ts';
import type { CreationAvatar } from '../server-agents/create-agent-from-agent.ts';
import {
    AgentCreationGuidanceRequiredError,
    AgentStandingBriefRequiredError,
} from '../server-agents/creation-guidance.ts';
import {
    AgentCreateConflictError,
    AgentCreateNoComputerError,
    AgentDescriptionTooLongError,
    AgentIdentityProtectedError,
    AgentTargetNotFoundError,
} from '../server-agents/errors.ts';
import { sendAgentApiError } from './auth.ts';
import { avatarProviderUnavailableNote, sendAvatarGenerationFailure } from './avatar-errors.ts';
import { AgentChatViewStaleError } from './chat-freshness-errors.ts';
import { agentDescriptionTooLongRefusal } from './description-invalid.ts';
import { AgentTargetError } from './resolve-target.ts';

/**
 * A Server with no avatar provider degrades: the Agent is created without one,
 * because no retry can provision a deployment. Every other generation failure
 * is transient, so it propagates and refuses before anything is written.
 */
export async function generateCreationAvatar(
    avatarImageService: AvatarImageService,
    runner: ResolvedRunner,
    input: AgentCreateAgentRequest
): Promise<CreationAvatar> {
    if (!input.avatarConcept) {
        return { bytes: null, outcome: { status: 'none' } };
    }
    try {
        const image = await avatarImageService.generate({
            agentId: runner.agentId,
            concept: input.avatarConcept,
            serverId: runner.serverId,
        });
        return {
            bytes: {
                bytes: image.bytes,
                mediaType: image.mediaType,
                sha256: hashAvatarBytes(image.bytes),
            },
            outcome: { byteSize: image.byteSize, status: 'generated' },
        };
    } catch (cause) {
        if (cause instanceof AvatarGenerationUnavailableError) {
            return {
                bytes: null,
                outcome: {
                    code: 'AVATAR_PROVIDER_UNAVAILABLE',
                    note: avatarProviderUnavailableNote,
                    status: 'unavailable',
                },
            };
        }
        throw cause;
    }
}

/** The one refusal vocabulary the three Agent-owned Agent routes speak. */
export function sendAgentRouteFailure(
    reply: Parameters<typeof sendAgentApiError>[0],
    cause: unknown,
    target: string | null
): unknown {
    const avatarFailure = sendAvatarGenerationFailure(reply, cause);
    if (avatarFailure !== null) {
        return avatarFailure;
    }
    if (cause instanceof AgentChatViewStaleError) {
        return sendAgentApiError(reply, cause.status, cause.code, cause.message, {
            nextAction: `Run haus message read --target "${target ?? ''}" before creating again.`,
        });
    }
    if (cause instanceof AgentCreateConflictError) {
        return sendAgentApiError(reply, 409, 'AGENT_CREATE_IDEMPOTENCY_CONFLICT', cause.message);
    }
    if (cause instanceof AgentStandingBriefRequiredError) {
        return sendAgentApiError(reply, 400, 'INVALID_ARG', cause.message, {
            nextAction:
                'Supply --brief, then retrieve the full agent, one-or-many and relevant archetype topics in this run before retrying.',
        });
    }
    if (cause instanceof AgentCreationGuidanceRequiredError) {
        return sendAgentApiError(reply, 409, 'AGENT_CREATION_GUIDANCE_REQUIRED', cause.message, {
            nextAction:
                'Use haus manual get agent and recipes/decision/one-or-many, then search recipes for the proposed lane and get its full archetype. Each lookup needs --intent and --reason. Adapt the guidance into --brief before retrying.',
        });
    }
    if (cause instanceof AgentCreateNoComputerError) {
        return sendAgentApiError(reply, 409, 'AGENT_NO_COMPUTER', cause.message, {
            nextAction: 'Ask an Owner or Admin to assign you a Computer first.',
        });
    }
    if (cause instanceof AgentDescriptionTooLongError) {
        return sendAgentApiError(reply, 400, 'INVALID_ARG', agentDescriptionTooLongRefusal);
    }
    if (cause instanceof AgentConfigDeniedError) {
        return sendAgentApiError(reply, 409, 'AGENT_CREATE_REFUSED', cause.message);
    }
    if (cause instanceof AgentIdentityProtectedError) {
        return sendAgentApiError(reply, 403, 'AGENT_IDENTITY_PROTECTED', cause.message);
    }
    if (cause instanceof AgentTargetNotFoundError || cause instanceof AgentAuthorNotFoundError) {
        return sendAgentApiError(reply, 404, 'AGENT_NOT_FOUND', cause.message);
    }
    if (cause instanceof AgentTargetError) {
        return sendAgentApiError(reply, 404, 'INVALID_TARGET', cause.message);
    }
    if (cause instanceof ChatArchivedError) {
        return sendAgentApiError(reply, 409, 'TARGET_READ_ONLY', cause.message);
    }
    return sendAgentApiError(reply, 500, 'SERVER_5XX', 'The Server could not record the Agent.');
}

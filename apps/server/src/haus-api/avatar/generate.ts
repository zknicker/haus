import { agentAvatarGenerationInputSchema, avatarGenerationResponseSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import {
    AvatarGenerationBusyError,
    AvatarGenerationProviderError,
    AvatarGenerationUnavailableError,
    AvatarImageOutputError,
} from '../../avatar-generation/errors.ts';
import { generateAgentAvatar } from '../../avatar-generation/generate-agent-avatar.ts';
import { avatarProcedure } from './procedure.ts';

export const generateAvatarProcedure = avatarProcedure
    .input(agentAvatarGenerationInputSchema)
    .output(avatarGenerationResponseSchema)
    .use(async ({ next }) => {
        const result = await next();

        if (result.ok) {
            return result;
        }

        const { cause } = result.error;
        if (cause instanceof AvatarGenerationBusyError) {
            throw new TRPCError({ cause, code: 'TOO_MANY_REQUESTS', message: cause.message });
        }

        if (cause instanceof AvatarGenerationUnavailableError) {
            // Not the precondition code: that one is reserved for the protocol
            // gate in trpc.ts, and the App treats it as "update required" — a
            // full-screen takeover, not a dialog error.
            throw new TRPCError({ cause, code: 'SERVICE_UNAVAILABLE', message: cause.message });
        }

        if (
            cause instanceof AvatarGenerationProviderError ||
            cause instanceof AvatarImageOutputError
        ) {
            throw new TRPCError({
                cause,
                code: 'INTERNAL_SERVER_ERROR',
                message: cause.message,
            });
        }

        throw result.error;
    })
    .mutation(async ({ ctx, input }) => {
        const generated = await generateAgentAvatar(
            ctx.hausDb,
            ctx.member,
            ctx.avatarImageService,
            input
        );

        return {
            avatar: {
                bytesBase64: Buffer.from(generated.bytes).toString('base64'),
                byteSize: generated.byteSize,
                height: generated.height,
                mediaType: generated.mediaType,
                width: generated.width,
            },
        };
    });

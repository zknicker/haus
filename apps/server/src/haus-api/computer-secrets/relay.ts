import type { ComputerSecretsOperation, ComputerSecretsStatus } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
    ComputerSecretsDeniedError,
    requestComputerSecrets,
} from '../../computer-secrets/request.ts';
import { computerIdSchema } from '../../computers/contracts.ts';
import { serverIdSchema } from '../../servers/contracts.ts';
import type { HausUser } from '../../users/haus-user.ts';
import type { HausContext } from '../context.ts';

export const computerSecretsTargetSchema = z
    .object({ computerId: computerIdSchema, serverId: serverIdSchema })
    .strict();

/** Relays one operation to its Computer and maps failures to tRPC errors without echoing input. */
export async function relayComputerSecrets(
    ctx: HausContext & { member: HausUser | null },
    input: z.infer<typeof computerSecretsTargetSchema>,
    operation: ComputerSecretsOperation
): Promise<ComputerSecretsStatus> {
    try {
        return await requestComputerSecrets(ctx.hausDb, ctx.computerConnections, ctx.member, {
            computerId: input.computerId,
            operation,
            serverId: input.serverId,
        });
    } catch (cause) {
        if (cause instanceof TRPCError) {
            throw cause;
        }
        if (cause instanceof ComputerSecretsDeniedError) {
            throw new TRPCError({ code: 'FORBIDDEN', message: cause.message });
        }
        throw new TRPCError({
            code: 'BAD_GATEWAY',
            message: cause instanceof Error ? cause.message : 'The Secrets request failed.',
        });
    }
}

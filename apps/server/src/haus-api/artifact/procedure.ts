import { type TRPC_ERROR_CODE_KEY, TRPCError } from '@trpc/server';
import { ArtifactError } from '../../artifacts/storage.ts';
import { memberProcedure } from '../server/procedure.ts';

/** tRPC codes for the artifact HTTP statuses; anything else is a conflict. */
const codes: Partial<Record<number, TRPC_ERROR_CODE_KEY>> = {
    400: 'BAD_REQUEST',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    413: 'PAYLOAD_TOO_LARGE',
    503: 'SERVICE_UNAVAILABLE',
};

export const artifactProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    const cause = result.error.cause;
    if (cause instanceof ArtifactError) {
        const code = codes[cause.status] ?? 'CONFLICT';
        throw new TRPCError({ cause, code, message: cause.message });
    }
    throw result.error;
});

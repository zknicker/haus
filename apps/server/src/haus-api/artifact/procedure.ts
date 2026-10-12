import { TRPCError } from '@trpc/server';
import { ArtifactError } from '../../artifacts/storage.ts';
import { memberProcedure } from '../server/procedure.ts';
export const artifactProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    const cause = result.error.cause;
    if (cause instanceof ArtifactError) {
        const code =
            cause.status === 404
                ? 'NOT_FOUND'
                : cause.status === 403
                  ? 'FORBIDDEN'
                  : cause.status === 503
                    ? 'SERVICE_UNAVAILABLE'
                    : 'CONFLICT';
        throw new TRPCError({ cause, code, message: cause.message });
    }
    throw result.error;
});

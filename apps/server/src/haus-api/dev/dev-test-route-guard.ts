import { TRPCError } from '@trpc/server';
import { assertEvalCleanupAllowed } from './cleanup-eval-chats.ts';

/**
 * Gates the test-only dev routes for the agent-test kit like eval chat cleanup:
 * never in production, and only from a localhost request.
 */
export function assertDevTestRouteAllowed(
    requestHost: string | null,
    developmentAuthEnabled: boolean
) {
    // The Host header is client-controlled. Only development and test lifecycles
    // provide the fixed development identity, so a hosted non-production
    // deployment cannot be reached by spoofing a localhost Host.
    if (!developmentAuthEnabled) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Dev test routes are available only in development.',
        });
    }
    assertEvalCleanupAllowed(requestHost, { nodeEnvironment: process.env.NODE_ENV });
}

import { LinearSignInRequiredError } from './linear-errors.ts';
import type { LinearTokenRefresher } from './token-refresh.ts';

// The workspace token a chip read or a thumbnail fetch uses, from the Server's
// one refresh owner (specs/linear-app.md#tokens): a token that would expire
// soon is refreshed first, never read raw.

/**
 * The workspace actor's access token for one Linear connection, or null when
 * the workspace cannot sign in (no Haus app, not `active`, or the credential
 * left `valid`). Any other failure is the caller's to surface.
 */
export function linearChipToken(
    refresher: LinearTokenRefresher | null
): (connectionId: string) => Promise<string | null> {
    return async (connectionId) => {
        if (!refresher) {
            return null;
        }
        try {
            return await refresher.connectionToken(connectionId);
        } catch (error) {
            if (error instanceof LinearSignInRequiredError) {
                return null;
            }
            throw error;
        }
    };
}

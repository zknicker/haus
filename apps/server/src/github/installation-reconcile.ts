import type { GithubInstallationStatus } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { GithubAppJwtSigner } from './app-auth.ts';
import type { GithubApiTransport } from './github-api.ts';
import { GithubNotImplementedError } from './not-implemented.ts';

export interface GithubReconcileDependencies {
    app: GithubAppJwtSigner;
    clock: { now(): Date };
    db: HausDatabase;
    transport?: GithubApiTransport;
}

/**
 * What reconciling one installation found. `unbound` means no live Haus row
 * holds that GitHub installation; `retry` means GitHub could not answer (429,
 * 5xx, rate-limited 403, network) and nothing changed.
 */
export type GithubReconcileOutcome =
    | { kind: 'reconciled'; installationRowId: string; status: GithubInstallationStatus }
    | { kind: 'retry' }
    | { kind: 'unbound' };

/**
 * Fetches `GET /app/installations/{id}` with the App JWT and derives the
 * installation's state from the answer, committing every status change with
 * its Trigger problems in one transaction
 * (specs/github-app-connection.md#lifecycle-reconciliation). Lifecycle
 * deliveries and the hourly sweep call this; neither is trusted on its own.
 */
export function reconcileGithubInstallation(
    _dependencies: GithubReconcileDependencies,
    _input: { githubInstallationId: number }
): Promise<GithubReconcileOutcome> {
    return Promise.reject(new GithubNotImplementedError('reconcileGithubInstallation (Slice B)'));
}

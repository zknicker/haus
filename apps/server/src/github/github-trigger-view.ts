import { type GithubTriggerView, githubTriggerEventsSchema } from '@haus/api';
import type { githubTriggerConfigsTable } from '../postgres/schema.ts';

/** A `github` Trigger's stored configuration and the login of its installation. */
export interface GithubTriggerRow {
    config: typeof githubTriggerConfigsTable.$inferSelect;
    installationLogin: string;
}

/**
 * The wire `github` block. Stored events are validated on the way out, so a
 * row that no longer matches the contract fails the read instead of
 * reaching a client half-formed.
 */
export function toGithubTriggerView(row: GithubTriggerRow): GithubTriggerView {
    const { config } = row;
    return {
        events: githubTriggerEventsSchema.parse(config.events),
        installationId: config.installationRowId,
        installationLogin: row.installationLogin,
        problem: config.problem,
        problemSince: config.problemSince?.toISOString() ?? null,
        repositories:
            config.repositoryScope === 'installation'
                ? { scope: 'installation' }
                : { names: config.repositoryNames, scope: 'repositories' },
        suppressedCount: config.suppressedCount,
    };
}

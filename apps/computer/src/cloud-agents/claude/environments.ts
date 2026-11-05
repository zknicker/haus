import { type CloudAgentEnvironment, cloudAgentEnvironmentSchema } from '@haus/api';
import * as z from 'zod';
import { readClaudeEnvironmentId, writeClaudeEnvironmentId } from '../settings.ts';
import { claudeControllerHeaders } from './native-auth.ts';

const environmentProvidersUrl = 'https://api.anthropic.com/v1/environment_providers';
const anthropicCloudKind = 'anthropic_cloud';

const responseSchema = z.object({
    environments: z.array(
        z.object({
            created_at: z.string().trim().min(1).optional(),
            environment_id: z.string().trim().min(1),
            kind: z.string(),
            name: z.string().trim().min(1),
            state: z.string(),
        })
    ),
});

/** One Anthropic-hosted environment, with the raw state Anthropic reports for it right now. */
export interface ClaudeCloudEnvironment {
    /** ISO 8601, when Anthropic reports it; absent entries sort last, never first. */
    createdAt: string | null;
    id: string;
    name: string;
    state: string;
}

export class ClaudeCloudEnvironmentUnavailableError extends Error {
    constructor(readonly environmentId: string) {
        super(
            `The Claude cloud environment pinned on this Computer (\`${environmentId}\`) no longer exists or is archived. Pick another one in Computer settings.`
        );
        this.name = 'ClaudeCloudEnvironmentUnavailableError';
    }
}

/**
 * This Computer's Anthropic-hosted Claude Cloud environments: the pin a
 * Computer's Claude launches choose from. Self-hosted pools (`ccpool_`) never
 * appear here; `--cloud` launches never land on one and Claude Code's own
 * environment picker excludes them too. The single owner for what Anthropic
 * currently says about an environment, so a launch's fail-fast check and
 * Computer settings' picker read the same live answer.
 */
export async function listClaudeCloudEnvironments(
    signal?: AbortSignal
): Promise<ClaudeCloudEnvironment[]> {
    const response = await fetch(environmentProvidersUrl, {
        headers: await claudeControllerHeaders(signal),
        signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
            : AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
        throw new Error(`Claude refused the environment list (HTTP ${response.status}).`);
    }
    const body = responseSchema.parse(await response.json());
    return body.environments
        .filter((environment) => environment.kind === anthropicCloudKind)
        .map((environment) => ({
            createdAt: environment.created_at ?? null,
            id: environment.environment_id,
            name: environment.name,
            state: environment.state,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** The picker's public shape: Anthropic's raw `state` stays inside this adapter. */
export function cloudAgentEnvironmentsOf(
    environments: ClaudeCloudEnvironment[]
): CloudAgentEnvironment[] {
    return environments.map(({ id, name }) => cloudAgentEnvironmentSchema.parse({ id, name }));
}

/**
 * Confirms a pinned environment id is still live. Fails closed: missing from
 * the current list, or reported archived, both refuse rather than let a
 * launch fall back to Claude Code's own default silently.
 */
export async function requireLiveClaudeCloudEnvironment(
    environmentId: string,
    signal?: AbortSignal
): Promise<ClaudeCloudEnvironment> {
    const environments = await listClaudeCloudEnvironments(signal);
    const match = environments.find((environment) => environment.id === environmentId);
    if (!match || match.state.toLowerCase() === 'archived') {
        throw new ClaudeCloudEnvironmentUnavailableError(environmentId);
    }
    return match;
}

/**
 * This Computer's live Claude cloud environments, auto-pinning one the first
 * time nothing is pinned yet. Never touches an existing pin — a stale or
 * archived pin is left as-is here; only a caller that needs to launch
 * validates liveness (`requireLiveClaudeCloudEnvironment`). The pin this
 * writes is permanent: a later call sees it already set and picks nothing
 * again, so a launch never re-evaluates which environment it runs on.
 */
export async function listClaudeCloudEnvironmentsAutoPinning(
    dataRoot: string,
    signal?: AbortSignal
): Promise<{ environmentId: string | null; environments: ClaudeCloudEnvironment[] }> {
    const environments = await listClaudeCloudEnvironments(signal);
    let environmentId = await readClaudeEnvironmentId(dataRoot);
    if (!environmentId) {
        const chosen = chooseDefaultClaudeEnvironment(environments);
        if (chosen) {
            environmentId = chosen.id;
            await writeClaudeEnvironmentId(dataRoot, environmentId);
        }
    }
    return { environmentId, environments };
}

/**
 * The environment a first auto-pin lands on: the one named "Default"
 * (case-insensitively), or failing that the oldest by `createdAt`. Never the
 * newest — picking whichever environment is newest is what let a Haus
 * launch land on a stray environment and broke that launch's 1Password
 * secret resolution. An environment Anthropic reports no creation time for
 * sorts after every environment that has one, so a missing timestamp can
 * only lose a tiebreak, never win one.
 */
function chooseDefaultClaudeEnvironment(
    environments: ClaudeCloudEnvironment[]
): ClaudeCloudEnvironment | null {
    const named = environments.find((environment) => environment.name.toLowerCase() === 'default');
    if (named) {
        return named;
    }
    const byAge = [...environments].sort((a, b) => {
        if (a.createdAt && b.createdAt) {
            return a.createdAt.localeCompare(b.createdAt);
        }
        if (a.createdAt) {
            return -1;
        }
        if (b.createdAt) {
            return 1;
        }
        return 0;
    });
    return byAge[0] ?? null;
}

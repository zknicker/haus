import { type CloudAgentEnvironment, cloudAgentEnvironmentSchema } from '@haus/api';
import * as z from 'zod';
import { claudeControllerHeaders } from './native-auth.ts';

const environmentProvidersUrl = 'https://api.anthropic.com/v1/environment_providers';
const anthropicCloudKind = 'anthropic_cloud';

const responseSchema = z.object({
    environments: z.array(
        z.object({
            environment_id: z.string().trim().min(1),
            kind: z.string(),
            name: z.string().trim().min(1),
            state: z.string(),
        })
    ),
});

/** One Anthropic-hosted environment, with the raw state Anthropic reports for it right now. */
export interface ClaudeCloudEnvironment {
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

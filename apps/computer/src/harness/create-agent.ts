import { basename, dirname, join } from 'node:path';
import type { HarnessV1 } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import type { ToolSet } from '@ai-sdk/provider-utils';
import type { HarnessTurnInput } from './executor.ts';
import { inactiveWebToolSettings } from './runtime-web-tools.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

type AgentConstructionInput = Pick<
    HarnessTurnInput,
    | 'agentId'
    | 'env'
    | 'homeDir'
    | 'modelId'
    | 'runtime'
    | 'runtimeId'
    | 'tools'
    | 'webAccess'
    | 'workspaceDir'
>;

/**
 * The Agent's skills are deliberately not handed to the harness. Every runtime
 * reads its native skill directory, and `ensureNativeSkillLinks` already points
 * those at the one canonical library, so asking the harness to materialize its
 * own copies would write the library back over itself — which the harness now
 * refuses, since it only overwrites skill directories it owns.
 */
export function createHarnessAgent(
    input: AgentConstructionInput,
    options: { harness: HarnessV1<ToolSet>; instructions: string }
): HarnessAgent {
    return new HarnessAgent({
        harness: options.harness,
        id: input.agentId,
        ...inactiveWebToolSettings(options.harness, input),
        instructions: options.instructions,
        model: input.modelId,
        permissionMode: 'allow-all',
        sandbox: createLocalTrustedSandboxProvider(sandboxOptions(input)),
        // Anchor at the parent so the workDir remains visible to workspace browsing.
        sandboxConfig: { workDir: basename(input.workspaceDir) },
        tools: input.tools,
    });
}

export function sandboxOptions(input: AgentConstructionInput) {
    const rootDir = dirname(input.workspaceDir);
    const profile = authProfileFor(input.runtimeId);
    if (input.runtimeId === 'grok-build') {
        return {
            authProfiles: ['grok-build'] as const,
            env: {
                ...input.env,
                GROK_HOME: join(input.homeDir, '.grok'),
                HOME: input.homeDir,
            },
            homeDir: input.homeDir,
            rootDir,
            runtime: input.runtime,
        };
    }
    if (input.runtimeId !== 'codex') {
        return {
            ...(profile ? { authProfiles: [profile] as const } : {}),
            env: { ...input.env, HOME: input.homeDir },
            homeDir: input.homeDir,
            rootDir,
            runtime: input.runtime,
        };
    }
    // Isolated CODEX_HOME reuses host login without leaking cross-Agent sessions.
    return {
        authProfiles: ['codex'] as const,
        env: {
            ...input.env,
            CODEX_HOME: join(input.homeDir, '.codex'),
            HOME: input.homeDir,
        },
        homeDir: input.homeDir,
        rootDir,
        runtime: input.runtime,
    };
}

function authProfileFor(runtimeId: string) {
    if (
        runtimeId === 'claude-code' ||
        runtimeId === 'codex' ||
        runtimeId === 'grok-build' ||
        runtimeId === 'pi'
    ) {
        return runtimeId;
    }
    return null;
}

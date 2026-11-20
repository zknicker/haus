import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { AgentReasoningEffort } from '@haus/api';
import { hausAllowedTools } from './haus-tools.ts';

export interface ClaudePaths {
    readonly configDir: string;
    readonly homeDir: string;
}

export type ClaudeEnvironment = (paths: ClaudePaths) => Record<string, string | undefined>;

export interface ClaudeLaunchFacts {
    readonly bootstrapFingerprint: string;
    readonly environment: Record<string, string | undefined>;
    readonly instructions: string;
    readonly modelId: string;
    readonly reasoningEffort: AgentReasoningEffort;
}

export const providerTools = ['WebSearch', 'WebFetch'];

export function claudePaths(agentDir: string) {
    const paths: ClaudePaths = {
        configDir: join(agentDir, 'claude'),
        homeDir: join(agentDir, 'home'),
    };
    return paths;
}

export function setupTokenEnvironment(setupToken: string | null) {
    const environment: ClaudeEnvironment = (paths) => ({
        ...(setupToken ? { CLAUDE_CODE_OAUTH_TOKEN: setupToken } : {}),
        CLAUDE_CONFIG_DIR: paths.configDir,
        HOME: paths.homeDir,
        PATH: process.env.PATH,
    });
    return environment;
}

export function claudeQueryOptions(
    launch: ClaudeLaunchFacts,
    session: { cwd: string; resume?: string; sessionId: string }
) {
    const options: Options = {
        allowedTools: hausAllowedTools,
        cwd: session.cwd,
        env: launch.environment,
        includePartialMessages: true,
        model: launch.modelId,
        permissionMode: 'dontAsk',
        settingSources: [],
        strictMcpConfig: true,
        systemPrompt: launch.instructions,
        thinking: launch.modelId.startsWith('claude-haiku-4-5')
            ? { type: 'adaptive' }
            : { display: 'summarized', type: 'adaptive' },
        tools: providerTools,
        ...(launch.reasoningEffort === 'default' ? {} : { effort: launch.reasoningEffort }),
        ...(session.resume ? { resume: session.resume } : { sessionId: session.sessionId }),
    };
    return options;
}

export function claudeLaunchKey(launch: ClaudeLaunchFacts) {
    return createHash('sha256')
        .update(
            JSON.stringify([
                launch.bootstrapFingerprint,
                Object.entries(launch.environment).sort(([left], [right]) =>
                    left.localeCompare(right)
                ),
                launch.instructions,
                launch.modelId,
                launch.reasoningEffort,
            ])
        )
        .digest('hex');
}

export async function claudeBootstrapFingerprint() {
    const sdkEntry = fileURLToPath(import.meta.resolve('@anthropic-ai/claude-agent-sdk'));
    const sdkPackage = JSON.parse(
        await readFile(join(dirname(sdkEntry), 'package.json'), 'utf8')
    ) as { version: string };
    return createHash('sha256')
        .update(
            JSON.stringify([
                sdkPackage.version,
                hausAllowedTools,
                providerTools,
                'dontAsk',
                'strictMcpConfig',
            ])
        )
        .digest('hex');
}

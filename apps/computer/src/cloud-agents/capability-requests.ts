import type { CloudAgentCapabilityRequest, CloudAgentCapabilityResult } from '@haus/api';
import { cloudAgentCapabilityRequestSchema, cloudAgentCapabilityResultSchema } from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import {
    cloudAgentEnvironmentsOf,
    listClaudeCloudEnvironmentsAutoPinning,
    requireLiveClaudeCloudEnvironment,
} from './claude/environments.ts';
import { providerSignIn } from './provider-sign-in.ts';
import {
    type CloudAgentProviderAccess,
    cloudAgentCapabilityState,
    cloudAgentProvider,
} from './registry.ts';
import {
    readClaudeEnvironmentId,
    readDefaultCloudAgentProvider,
    writeClaudeEnvironmentId,
    writeDefaultCloudAgentProvider,
} from './settings.ts';

export function parseCloudAgentCapabilityRequest(
    value: unknown
): CloudAgentCapabilityRequest | null {
    const parsed = cloudAgentCapabilityRequestSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/**
 * The Computer side of the Cloud Agent capability row in Computer settings.
 * `connect` returns a sign-in link while Computer waits for approval and owns
 * the credential store. No credential travels back. `make-default` names the
 * provider an Agent's `start` uses when it names none. `set-environment` pins
 * this Computer's Claude launches to one Anthropic-hosted environment, or
 * clears the pin with `null`. Only a human action in settings reaches this
 * path, never an Agent turn.
 */
export async function runCloudAgentCapabilityRequest(
    request: CloudAgentCapabilityRequest,
    runtime: EffectRuntime<never>,
    dataRoot: string
): Promise<CloudAgentCapabilityResult> {
    const provider = cloudAgentProvider(request.provider, dataRoot);
    try {
        const state = await resolve(request.operation);
        const defaultProvider = await readDefaultCloudAgentProvider(dataRoot);
        return cloudAgentCapabilityResultSchema.parse({
            requestId: request.requestId,
            result: { ...state, isDefault: defaultProvider === request.provider },
            type: 'cloud-agent-capability-result',
        });
    } catch (error) {
        return cloudAgentCapabilityResultSchema.parse({
            error: safeCapabilityError(error),
            requestId: request.requestId,
            type: 'cloud-agent-capability-result',
        });
    }

    async function resolve(
        operation: CloudAgentCapabilityRequest['operation']
    ): Promise<CloudAgentProviderAccess> {
        const signIn = providerSignIn(runtime, provider);
        switch (operation.kind) {
            case 'get':
                return withEnvironments(await signIn.get());
            case 'connect':
                return withEnvironments(await signIn.connect());
            case 'cancel-sign-in':
                return withEnvironments(await signIn.cancel());
            case 'disconnect':
                await signIn.cancel();
                return withEnvironments(
                    cloudAgentCapabilityState(provider, await provider.disconnect())
                );
            case 'make-default':
                await writeDefaultCloudAgentProvider(dataRoot, request.provider);
                return withEnvironments(await signIn.get());
            case 'set-environment':
                if (provider.provider !== 'claude') {
                    throw new Error(`${provider.provider} has no cloud environment to pin.`);
                }
                if (operation.environmentId !== null) {
                    await requireLiveClaudeCloudEnvironment(operation.environmentId);
                }
                await writeClaudeEnvironmentId(dataRoot, operation.environmentId);
                return withEnvironments(await signIn.get());
        }
    }

    /** Claude only: the current pin and the live picker list ride every result. */
    async function withEnvironments(
        state: CloudAgentProviderAccess
    ): Promise<CloudAgentProviderAccess> {
        if (provider.provider !== 'claude') {
            return { ...state, environmentId: null, environments: null };
        }
        if (!state.ready) {
            return {
                ...state,
                environmentId: await readClaudeEnvironmentId(dataRoot),
                environments: null,
            };
        }
        try {
            const resolved = await listClaudeCloudEnvironmentsAutoPinning(dataRoot);
            return {
                ...state,
                environmentId: resolved.environmentId,
                environments: cloudAgentEnvironmentsOf(resolved.environments),
            };
        } catch {
            return {
                ...state,
                environmentId: await readClaudeEnvironmentId(dataRoot),
                environments: null,
            };
        }
    }
}

/**
 * A provider error reaches settings as one bounded line. Provider errors can
 * quote request context, so the message is truncated rather than forwarded
 * whole, and nothing here ever touches the credential itself.
 */
function safeCapabilityError(error: unknown): string {
    const message = error instanceof Error ? error.message : 'The Cloud Agent request failed.';
    return message.trim().slice(0, 500) || 'The Cloud Agent request failed.';
}

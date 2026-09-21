import type { CloudAgentCapabilityRequest, CloudAgentCapabilityResult } from '@haus/api';
import { cloudAgentCapabilityRequestSchema, cloudAgentCapabilityResultSchema } from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import { providerSignIn } from './provider-sign-in.ts';
import { cloudAgentCapabilityState, cloudAgentProvider } from './registry.ts';

export function parseCloudAgentCapabilityRequest(
    value: unknown
): CloudAgentCapabilityRequest | null {
    const parsed = cloudAgentCapabilityRequestSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/**
 * The Computer side of the Cloud Agent capability row in Computer settings.
 * `connect` returns a sign-in link while Computer waits for approval and owns
 * the credential store. No credential travels back. Only a
 * human action in settings reaches this path, never an Agent turn.
 */
export async function runCloudAgentCapabilityRequest(
    request: CloudAgentCapabilityRequest,
    runtime: EffectRuntime<never>
): Promise<CloudAgentCapabilityResult> {
    const provider = cloudAgentProvider();
    try {
        if (provider.provider !== request.provider) {
            throw new Error(`This Computer has no ${request.provider} Cloud Agent provider.`);
        }
        const state = await resolve(request.operation.kind);
        return cloudAgentCapabilityResultSchema.parse({
            requestId: request.requestId,
            result: state,
            type: 'cloud-agent-capability-result',
        });
    } catch (error) {
        return cloudAgentCapabilityResultSchema.parse({
            error: safeCapabilityError(error),
            requestId: request.requestId,
            type: 'cloud-agent-capability-result',
        });
    }

    async function resolve(kind: CloudAgentCapabilityRequest['operation']['kind']) {
        const signIn = providerSignIn(runtime, provider);
        switch (kind) {
            case 'get':
                return signIn.get();
            case 'connect':
                return signIn.connect();
            case 'cancel-sign-in':
                return signIn.cancel();
            case 'disconnect':
                await signIn.cancel();
                return cloudAgentCapabilityState(provider, await provider.disconnect());
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

import {
    type CloudAgentCapabilityState,
    type CloudAgentProvider as CloudAgentProviderId,
    type CloudAgentProviderReadiness,
    cloudAgentProviders,
} from '@haus/api';
import { createClaudeCloudAgentProvider } from './claude/provider.ts';
import { createCursorCloudAgentProvider } from './cursor/provider.ts';
import { createCursorSdkTransport } from './cursor/sdk-transport.ts';
import { readCloudAgentModelCatalog } from './model-catalog.ts';
import type { CloudAgentProvider, CloudAgentReadiness } from './provider.ts';

/**
 * Cursor and Claude are the Cloud Agent providers every Computer ships with.
 * Each reports its own readiness truthfully — `not-connected` until a
 * credential resolves — so an unconnected Computer needs no placeholder
 * provider and a launch still fails before any Message exists.
 */
const installed: Record<CloudAgentProviderId, CloudAgentProvider> = {
    claude: createClaudeCloudAgentProvider(),
    cursor: createCursorCloudAgentProvider(createCursorSdkTransport()),
};

/** The adapter for one Cloud Agent provider on this Computer. */
export function cloudAgentProvider(provider: CloudAgentProviderId): CloudAgentProvider {
    return installed[provider];
}

/** Installs a provider adapter; returns the restore for tests and teardown. */
export function setCloudAgentProvider(provider: CloudAgentProvider): () => void {
    const previous = installed[provider.provider];
    installed[provider.provider] = provider;
    return () => {
        installed[provider.provider] = previous;
    };
}

/**
 * The Cloud Agent capability line in the Computer inventory. It is reported
 * separately from the runtime harnesses even when a provider shares a vendor
 * with one, because the two use different credential stores. It is read fresh
 * on every Computer report, so a credential that appears between reports shows
 * up on the next one. The provider's model catalog rides the same line; it is
 * cached per account and read from the provider at most daily.
 */
export function detectCloudAgentProviders(
    defaultProvider: CloudAgentProviderId
): Promise<CloudAgentProviderReadiness[]> {
    return Promise.all(
        cloudAgentProviders.map(async (id) => {
            const provider = cloudAgentProvider(id);
            const readiness = await readCloudAgentReadiness(provider);
            return {
                isDefault: id === defaultProvider,
                models: await readCloudAgentModelCatalog(provider, readiness),
                provider: id,
                ready: readiness.ready,
                reason: readiness.ready ? null : readiness.reason,
            };
        })
    );
}

/** One provider's access as Computer settings read it, before the default is known. */
export type CloudAgentProviderAccess = Omit<CloudAgentCapabilityState, 'isDefault'>;

/** The same capability, plus the account it resolves to, for Computer settings. */
export function cloudAgentCapabilityState(
    provider: CloudAgentProvider,
    readiness: CloudAgentReadiness
): CloudAgentProviderAccess {
    return readiness.ready
        ? {
              accountEmail: readiness.account.email,
              expiresAt: readiness.account.expiresAt,
              provider: provider.provider,
              ready: true,
              reason: null,
          }
        : {
              accountEmail: null,
              expiresAt: null,
              provider: provider.provider,
              ready: false,
              reason: readiness.reason,
          };
}

/** A provider that cannot answer at all is reported as unreachable, not omitted. */
export function readCloudAgentReadiness(
    provider: CloudAgentProvider
): Promise<CloudAgentReadiness> {
    return provider
        .readiness()
        .catch(() => ({ ready: false as const, reason: 'provider-unavailable' as const }));
}

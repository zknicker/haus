import type { CloudAgentCapabilityState, CloudAgentProviderReadiness } from '@haus/api';
import { createCursorCloudAgentProvider } from './cursor/provider.ts';
import { createCursorSdkTransport } from './cursor/sdk-transport.ts';
import { readCloudAgentModelCatalog } from './model-catalog.ts';
import type { CloudAgentProvider, CloudAgentReadiness } from './provider.ts';

/**
 * Cursor is the Cloud Agent provider every Computer ships with. It reports its
 * own readiness truthfully — `not-connected` until a credential resolves — so
 * an unconnected Computer needs no placeholder provider and a launch still
 * fails before any Message exists.
 */
let installed: CloudAgentProvider = createCursorCloudAgentProvider(createCursorSdkTransport());

/** The Cloud Agent provider this Computer can reach. */
export function cloudAgentProvider(): CloudAgentProvider {
    return installed;
}

/** Installs a provider adapter; returns the restore for tests and teardown. */
export function setCloudAgentProvider(provider: CloudAgentProvider): () => void {
    const previous = installed;
    installed = provider;
    return () => {
        installed = previous;
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
export async function detectCloudAgentProviders(): Promise<CloudAgentProviderReadiness[]> {
    const provider = cloudAgentProvider();
    const readiness = await readCloudAgentReadiness(provider);
    return [
        {
            models: await readCloudAgentModelCatalog(provider, readiness),
            provider: provider.provider,
            ready: readiness.ready,
            reason: readiness.ready ? null : readiness.reason,
        },
    ];
}

/** The same capability, plus the account it resolves to, for Computer settings. */
export function cloudAgentCapabilityState(
    provider: CloudAgentProvider,
    readiness: CloudAgentReadiness
): CloudAgentCapabilityState {
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

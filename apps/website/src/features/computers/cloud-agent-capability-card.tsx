import { cloudAgentProviders } from '@haus/api';
import { ItemCardGroup } from '@heroui-pro/react';
import { CloudAgentProviderCapability } from './cloud-agent-provider-capability.tsx';

/**
 * Cloud Agent provider access on this Computer — a capability of the machine,
 * beside its runtimes, not a runtime itself. The two stay separate because a
 * provider's cloud credential and its runtime CLI can live in different
 * stores even for one account. One row per provider; the default is the one
 * `haus cloud-agent start` uses when an Agent names none.
 */
export function CloudAgentCapabilityCard({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Cloud Agents</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    {cloudAgentProviders.map((provider) => (
                        <CloudAgentProviderCapability
                            computerId={computerId}
                            key={provider}
                            provider={provider}
                            serverId={serverId}
                        />
                    ))}
                </ItemCardGroup>
            </ItemCardGroup>
        </section>
    );
}

import { cloudAgentProviders } from '@haus/api';
import { ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { Fragment } from 'react';
import { CloudAgentProviderCapability } from './cloud-agent-provider-capability.tsx';

/**
 * The cloud places this device carries Workers to: one row per provider, its
 * login kept on this device. The default is the one `haus worker start` uses
 * when a Captain names none.
 */
export function CloudWorkersSection({
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
                    <ItemCardGroup.Title>Cloud Workers</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup>
                    {cloudAgentProviders.map((provider, index) => (
                        <Fragment key={provider}>
                            {index > 0 ? <Separator /> : null}
                            <CloudAgentProviderCapability
                                computerId={computerId}
                                provider={provider}
                                serverId={serverId}
                            />
                        </Fragment>
                    ))}
                </ItemCardGroup>
            </ItemCardGroup>
        </section>
    );
}

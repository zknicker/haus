import { ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { BrowserCapabilityRow } from './browser-capability-card.tsx';
import { SecretsCapability } from './secrets-capability-card.tsx';

export function ComputerToolsSection({
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
                    <ItemCardGroup.Title>Tools</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup>
                    <BrowserCapabilityRow computerId={computerId} serverId={serverId} />
                    <Separator />
                    <SecretsCapability computerId={computerId} serverId={serverId} />
                </ItemCardGroup>
            </ItemCardGroup>
        </section>
    );
}

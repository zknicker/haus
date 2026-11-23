import type { ComputerRuntimeId } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Disclosure } from '@heroui/react';
import { useState } from 'react';
import { ComputerUsageCapacity } from '../usage/computer-usage-capacity.tsx';
import { RecoveryCommands } from './computer-actions.tsx';
import { ComputerInventoryRefresh } from './computer-inventory-refresh.tsx';
import { ComputerSystemLog } from './computer-system-log-card.tsx';
import {
    ComputerUpdatePreviewMenu,
    type ComputerUpdatePreviewState,
} from './computer-update-preview.tsx';

export function ComputerDiagnostics({
    computerId,
    onUpdatePreviewChange,
    runtimeIds,
    serverId,
    serverSlug,
    updatePreview,
}: {
    computerId: string;
    onUpdatePreviewChange: (state: ComputerUpdatePreviewState) => void;
    runtimeIds: ComputerRuntimeId[];
    serverId: string;
    serverSlug: string;
    updatePreview: ComputerUpdatePreviewState;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    return (
        <section>
            <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
                <Disclosure.Heading>
                    <Button size="sm" slot="trigger" variant="ghost">
                        Diagnostics
                        <Disclosure.Indicator />
                    </Button>
                </Disclosure.Heading>
                <Disclosure.Content>
                    {isExpanded ? (
                        <div className="flex flex-col gap-8 pt-4">
                            <ItemCardGroup variant="transparent">
                                <ItemCardGroup.Header>
                                    <ItemCardGroup.Title>Plan usage</ItemCardGroup.Title>
                                    <ComputerInventoryRefresh
                                        computerId={computerId}
                                        serverId={serverId}
                                    />
                                </ItemCardGroup.Header>
                                <ComputerUsageCapacity
                                    computerId={computerId}
                                    detectedRuntimeIds={runtimeIds}
                                    serverId={serverId}
                                />
                            </ItemCardGroup>
                            <ComputerSystemLog computerId={computerId} serverId={serverId} />
                            <RecoveryCommands serverSlug={serverSlug} />
                            {import.meta.env.DEV ? (
                                <ItemCardGroup>
                                    <ItemCard>
                                        <ItemCard.Content>
                                            <ItemCard.Title>Update preview</ItemCard.Title>
                                        </ItemCard.Content>
                                        <ItemCard.Action>
                                            <ComputerUpdatePreviewMenu
                                                onChange={onUpdatePreviewChange}
                                                value={updatePreview}
                                            />
                                        </ItemCard.Action>
                                    </ItemCard>
                                </ItemCardGroup>
                            ) : null}
                        </div>
                    ) : null}
                </Disclosure.Content>
            </Disclosure>
        </section>
    );
}

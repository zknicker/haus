import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { CodeBlock } from '@heroui-pro/react/code-block';
import { Button, Separator, Tooltip } from '@heroui/react';
import { useState } from 'react';

import { useComputers } from '../../hooks/servers/use-computers.ts';
import {
    type ComputerRemovalAvailability,
    computerRemovalDescription,
    useComputerRemovalAvailability,
} from './computer-removal.ts';
import { ComputerUpdateControls } from './computer-update-controls.tsx';
import {
    ComputerUpdatePreviewMenu,
    type ComputerUpdatePreviewState,
} from './computer-update-preview.tsx';

export function ComputerActions({
    computerId,
    onRemove,
    serverId,
    serverSlug,
}: {
    computerId: string;
    onRemove: () => void;
    serverId: string;
    serverSlug: string;
}) {
    const computers = useComputers(serverId);
    const removalAvailability = useComputerRemovalAvailability(serverId, computerId);
    const [updatePreviewState, setUpdatePreviewState] =
        useState<ComputerUpdatePreviewState>('live');
    const computer = computers.data?.find((candidate) => candidate.id === computerId);

    if (!computer) {
        return null;
    }

    return (
        <section className="grid gap-8">
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header className="flex items-center justify-between">
                    <ItemCardGroup.Title>Computer Management</ItemCardGroup.Title>
                    {import.meta.env.DEV ? (
                        <ComputerUpdatePreviewMenu
                            onChange={setUpdatePreviewState}
                            value={updatePreviewState}
                        />
                    ) : null}
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <ComputerUpdateControls
                        computer={computer}
                        previewState={updatePreviewState}
                        serverId={serverId}
                    />
                    <Separator />
                    <ComputerRemovalAction availability={removalAvailability} onRemove={onRemove} />
                </ItemCardGroup>
            </ItemCardGroup>
            <RecoveryCommands serverSlug={serverSlug} />
        </section>
    );
}

export function RecoveryCommands({ serverSlug }: { serverSlug: string }) {
    const commands = [
        '# Check whether each Server attachment is stopped or running',
        'haus-computer status',
        '',
        '# Check local files and Server credential acceptance',
        'haus-computer doctor',
        '',
        '# Restart this attachment if it stops responding',
        `haus-computer restart /${serverSlug}`,
        '',
        '# Restore the previous verified Computer release',
        'haus-computer upgrade --rollback',
    ].join('\n');

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Recovery Commands</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <CodeBlock>
                <CodeBlock.Header>
                    <span className="text-muted text-sm">Shell</span>
                    <CodeBlock.CopyButton aria-label="Copy recovery commands" code={commands} />
                </CodeBlock.Header>
                <CodeBlock.Code code={commands} language="shellscript" />
            </CodeBlock>
        </ItemCardGroup>
    );
}

export function ComputerRemovalAction({
    availability,
    onRemove,
}: {
    availability: ComputerRemovalAvailability;
    onRemove: () => void;
}) {
    const isBlocked = availability.status !== 'ready';
    const description = computerRemovalDescription(availability);
    const button = (
        <Button isDisabled={isBlocked} onPress={onRemove} size="sm" variant="danger-soft">
            Remove Computer
        </Button>
    );

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Remove Computer</ItemCard.Title>
                <ItemCard.Description>
                    Permanently remove this Computer. All Agents must be deleted first.
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                {isBlocked ? (
                    <Tooltip delay={0}>
                        <Tooltip.Trigger aria-label={description}>
                            <span className="inline-flex cursor-not-allowed">{button}</span>
                        </Tooltip.Trigger>
                        <Tooltip.Content showArrow>
                            <Tooltip.Arrow />
                            <p className="max-w-xs">{description}</p>
                        </Tooltip.Content>
                    </Tooltip>
                ) : (
                    button
                )}
            </ItemCard.Action>
        </ItemCard>
    );
}

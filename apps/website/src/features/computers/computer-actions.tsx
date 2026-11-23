import { ItemCardGroup } from '@heroui-pro/react';
import { CodeBlock } from '@heroui-pro/react/code-block';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { updateInput } from './computer-update-card.tsx';
import { ComputerUpdateControls } from './computer-update-controls.tsx';
import { showsComputerUpdateCard } from './computer-update-model.ts';
import {
    type ComputerUpdatePreviewState,
    previewComputerUpdate,
} from './computer-update-preview.tsx';
import { useUpdateExpiryRefresh } from './use-update-expiry-refresh.ts';

export function ComputerUpdates({
    computerId,
    previewState,
    serverId,
}: {
    computerId: string;
    previewState: ComputerUpdatePreviewState;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const live = computers.data?.find((candidate) => candidate.id === computerId);
    const computer = live ? previewComputerUpdate(live, previewState) : undefined;
    useUpdateExpiryRefresh(computer);

    if (!computer) {
        return null;
    }
    if (!showsComputerUpdateCard(updateInput(computer))) {
        return null;
    }

    return (
        <section aria-label="Software update">
            <ItemCardGroup>
                <ComputerUpdateControls
                    computer={computer}
                    isPreview={previewState !== 'live'}
                    serverId={serverId}
                />
            </ItemCardGroup>
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
                <ItemCardGroup.Title>Recovery commands</ItemCardGroup.Title>
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

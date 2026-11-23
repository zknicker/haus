import { ItemCardGroup } from '@heroui-pro/react';
import { CodeBlock } from '@heroui-pro/react/code-block';
import { useState } from 'react';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { ComputerUpdateControls } from './computer-update-controls.tsx';
import {
    ComputerUpdatePreviewMenu,
    type ComputerUpdatePreviewState,
} from './computer-update-preview.tsx';

export function ComputerUpdates({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const [updatePreviewState, setUpdatePreviewState] =
        useState<ComputerUpdatePreviewState>('live');
    const computer = computers.data?.find((candidate) => candidate.id === computerId);

    if (!computer) {
        return null;
    }

    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header className="flex items-center justify-between">
                    <ItemCardGroup.Title>Updates</ItemCardGroup.Title>
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
                </ItemCardGroup>
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

import { type Agent, artifactPathKey } from '@haus/api';
import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { File02Icon, Folder01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { useDriveFolderFiles } from '../../../hooks/artifacts/use-drive-folder-files.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { artifactViewerHref, libraryHref } from '../../artifacts/library-params.ts';

const ruleFiles = ['AGENTS.md', 'WORKER.md', 'MEMORY.md'] as const;

export function AgentDrive({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const navigate = useNavigate();
    const folder = `agents/${agent.handle}`;
    const listing = useDriveFolderFiles(server.id, folder);
    if (!listing.files) {
        return null;
    }
    const view = { creator: null, folder, kind: 'all' } as const;
    const folderHref = libraryHref(server.slug, view);
    const rows = [
        ...ruleFiles.map((name) => {
            const file = listing.files?.find(
                (entry) => artifactPathKey(entry.path) === artifactPathKey(`${folder}/${name}`)
            );
            return {
                href: file
                    ? artifactViewerHref(server.slug, file.artifact_id, { ...view, query: '' })
                    : folderHref,
                icon: File02Icon,
                key: name,
                title: name,
            };
        }),
        { href: folderHref, icon: Folder01Icon, key: folder, title: 'All files' },
    ];

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Drive</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {rows.map((row, index) => (
                    <React.Fragment key={row.key}>
                        {index > 0 ? <Separator /> : null}
                        <ItemCard<'button'>
                            className="focus-visible:ring-focus relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2"
                            onClick={() => navigate(row.href)}
                            render={(props) => <button type="button" {...props} />}
                        >
                            <PressableFeedback.Highlight />
                            <ItemCard.Icon>
                                <Icon aria-hidden="true" icon={row.icon} />
                            </ItemCard.Icon>
                            <ItemCard.Content>
                                <ItemCard.Title>{row.title}</ItemCard.Title>
                            </ItemCard.Content>
                        </ItemCard>
                    </React.Fragment>
                ))}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

import type { ArtifactRecord } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { MoreVerticalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { taskRoute } from '../servers/server-routes.ts';
import type { ArtifactCreatorDirectory } from './artifact-creators.ts';
import { formatArtifactBytes, formatArtifactDate } from './artifact-format.ts';
import { isMergedRevision } from './artifact-revision-base.ts';

export function ArtifactHistoryRow({
    compareHref,
    directory,
    onRestore,
    restore,
    serverId,
    slug,
    version,
    viewHref,
}: {
    compareHref: string | null;
    directory: ArtifactCreatorDirectory;
    onRestore: (() => void) | null;
    restore: { isPending: boolean; isRestoring: boolean };
    serverId: string;
    slug: string;
    version: ArtifactRecord;
    viewHref: string | null;
}) {
    const navigate = useNavigate();
    const number = version.revision_number;
    const title = `Revision ${number}`;
    return (
        <ItemCard className="artifact-history-row" data-viewing={viewHref === null || undefined}>
            <ItemCard.Content>
                <ItemCard.Title className="flex items-center gap-1.5">
                    {viewHref === null ? (
                        <span>{title}</span>
                    ) : (
                        <Link
                            {...opensPlace}
                            aria-label={`View revision ${number}`}
                            className="artifact-history-row__link"
                            to={viewHref}
                        >
                            {title}
                        </Link>
                    )}
                    {viewHref === null ? (
                        <Chip color="accent" size="sm" variant="soft">
                            Viewing
                        </Chip>
                    ) : null}
                    {isMergedRevision(version) ? (
                        <Chip size="sm" variant="soft">
                            Merged
                        </Chip>
                    ) : null}
                </ItemCard.Title>
                <ItemCard.Description>
                    {directory.name(version.author)} · {formatArtifactBytes(version.size_bytes)} ·{' '}
                    {formatArtifactDate(version.updated_at)}
                </ItemCard.Description>
                {version.task_id ? (
                    <RevisionTask serverId={serverId} slug={slug} taskId={version.task_id} />
                ) : null}
            </ItemCard.Content>
            <ItemCard.Action>
                {compareHref || onRestore ? (
                    <Dropdown>
                        <Button
                            aria-label={`Revision ${number} actions`}
                            isIconOnly
                            isPending={restore.isRestoring}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon icon={MoreVerticalIcon} size={16} />
                        </Button>
                        <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu
                                aria-label={`Revision ${number} actions`}
                                onAction={(key) => {
                                    if (key === 'compare' && compareHref) {
                                        navigate(compareHref);
                                    }
                                    if (key === 'restore') {
                                        onRestore?.();
                                    }
                                }}
                            >
                                {compareHref ? (
                                    <Dropdown.Item id="compare" textValue="Compare">
                                        <Label>Compare</Label>
                                    </Dropdown.Item>
                                ) : null}
                                {onRestore ? (
                                    <Dropdown.Item
                                        id="restore"
                                        isDisabled={restore.isPending}
                                        textValue="Restore"
                                    >
                                        <Label>Restore</Label>
                                    </Dropdown.Item>
                                ) : null}
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                ) : null}
            </ItemCard.Action>
        </ItemCard>
    );
}

function RevisionTask({
    serverId,
    slug,
    taskId,
}: {
    serverId: string;
    slug: string;
    taskId: string;
}) {
    const task = useTask(serverId, { taskId }).data;
    if (!task) {
        return null;
    }
    return (
        <ItemCard.Description>
            <Link className="text-accent" to={taskRoute(slug, task.key)}>
                {task.key} {task.title}
            </Link>
        </ItemCard.Description>
    );
}

import { Button, Tooltip } from '@heroui/react';
import { Edit02Icon, FilterIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useTaskLabels } from '../../../hooks/servers/use-task-labels.ts';
import { useServerContext } from '../server-context.ts';
import { ClaimBackgroundToggle } from './claim-background-toggle.tsx';
import { ClaimDisplayMenu } from './claim-display-menu.tsx';
import { ClaimFilterMenu } from './claim-filter-menu.tsx';
import type { ClaimFilterField } from './claim-filters.tsx';
import { claimChatOptions } from './claim-model.ts';
import { useClaimView } from './claim-view.ts';
import { NewClaimDialog } from './new-claim-dialog.tsx';
import { TaskLabelsDialog } from './task-labels.tsx';

/**
 * Topbar controls for the Tasks page. Narrowing and drawing are icon buttons
 * that open menus, so the band stays quiet until you ask it something; what
 * is currently applied shows as pills in the row below.
 */
export function ClaimControls({
    canManage,
    fields,
}: {
    canManage: boolean;
    fields: ClaimFilterField[];
}) {
    const { server } = useServerContext();
    const chats = useChats(server.id);
    const humans = useHumanDirectory(server.id);
    const labelsQuery = useTaskLabels(server.id);
    const { filters } = useClaimView();
    const [composeOpen, setComposeOpen] = React.useState(false);
    const [labelsOpen, setLabelsOpen] = React.useState(false);
    // A new claim lands in the scoped chat when one is filtered, so the compose
    // dialog offers exactly the chats the current view is about.
    const scopedChats = filters.chatId
        ? (chats.data?.filter((chat) => chat.id === filters.chatId) ?? [])
        : (chats.data ?? []);
    const chatOptions = claimChatOptions(scopedChats, humans);

    return (
        <>
            <ClaimBackgroundToggle />
            <ClaimFilterMenu fields={fields} icon={FilterIcon} label="Filter" />
            <ClaimDisplayMenu />
            {canManage ? (
                <Tooltip delay={0}>
                    <Button
                        aria-label="Manage Labels"
                        isIconOnly
                        onPress={() => setLabelsOpen(true)}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={Edit02Icon} size={16} />
                    </Button>
                    <Tooltip.Content>Manage Labels</Tooltip.Content>
                </Tooltip>
            ) : null}
            <Button
                isDisabled={chatOptions.length === 0}
                onPress={() => setComposeOpen(true)}
                size="sm"
                variant="primary"
            >
                New Task
            </Button>
            <NewClaimDialog
                chats={chatOptions}
                onOpenChange={setComposeOpen}
                open={composeOpen}
                serverId={server.id}
            />
            <TaskLabelsDialog
                canManage={canManage}
                labels={labelsQuery.data ?? []}
                onOpenChange={setLabelsOpen}
                open={labelsOpen}
                serverId={server.id}
            />
        </>
    );
}

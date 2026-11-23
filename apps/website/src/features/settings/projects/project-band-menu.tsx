import type { Chat } from '@haus/api';
import { Button, Dropdown, Label } from '@heroui/react';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    ArrowUpRight01Icon,
    Delete02Icon,
    MoreHorizontalIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { useChannelActions } from '../../servers/chat/use-channel-actions.tsx';
import {
    serverChatRoute,
    serverSettingsSectionRoute,
    settingsProjectRoute,
} from '../../servers/server-routes.ts';

export function ProjectBandMenu({ chat, slug }: { chat: Chat; slug: string }) {
    const navigate = useNavigate();
    const actions = useChannelActions({
        onDeleted: () => navigate(serverSettingsSectionRoute(slug, 'projects'), { replace: true }),
        openSettings: (chatId) => navigate(settingsProjectRoute(slug, chatId)),
        slug,
    });
    const archived = Boolean(chat.archivedAt);
    const onAction = (key: React.Key) => {
        if (key === 'open') {
            navigate(serverChatRoute(slug, chat.id));
            return;
        }
        actions.run(chat, key);
    };

    return (
        <>
            <Dropdown>
                <Button aria-label={`#${chat.name} actions`} isIconOnly size="sm" variant="ghost">
                    <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                </Button>
                <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu onAction={onAction}>
                        <Dropdown.Item id="open" textValue="Open project">
                            <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                            <Label>Open project</Label>
                        </Dropdown.Item>
                        {actions.canManage ? (
                            <Dropdown.Item
                                id={archived ? 'restore' : 'archive'}
                                isDisabled={actions.lifecyclePending}
                                textValue={archived ? 'Restore project' : 'Archive project'}
                            >
                                <Icon
                                    aria-hidden="true"
                                    icon={archived ? ArchiveRestoreIcon : ArchiveIcon}
                                    size={16}
                                />
                                <Label>{archived ? 'Restore project' : 'Archive project'}</Label>
                            </Dropdown.Item>
                        ) : null}
                        {actions.canManage ? (
                            <Dropdown.Item
                                id="delete"
                                isDisabled={actions.lifecyclePending}
                                textValue="Delete project"
                                variant="danger"
                            >
                                <Icon aria-hidden="true" icon={Delete02Icon} size={16} />
                                <Label>Delete project</Label>
                            </Dropdown.Item>
                        ) : null}
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown>
            {actions.dialogs}
        </>
    );
}

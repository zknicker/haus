import type { Chat, Project } from '@haus/api';
import { Chip } from '@heroui/react';
import { useChannelUpdate } from '../../../hooks/servers/use-channel-update.ts';
import { ChannelAppearancePicker } from '../../chats/channel-appearance-picker.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';

export function ProjectHeader({ chat, project }: { chat: Chat; project: Project }) {
    const update = useChannelUpdate(chat);

    return (
        <div>
            <div className="flex min-w-0 items-center gap-3">
                <ChannelAppearancePicker
                    appearance={{ color: chat.color, icon: chat.icon }}
                    isDisabled={Boolean(chat.archivedAt)}
                    onChange={(appearance) =>
                        update.mutate({
                            chatId: chat.id,
                            color: appearance.color,
                            icon: appearance.icon,
                            serverId: chat.serverId,
                        })
                    }
                />
                <SettingsPageHeader
                    meta={
                        <span className="flex items-center gap-1.5">
                            <Chip size="sm" variant="soft">
                                <Chip.Label>{project.key}</Chip.Label>
                            </Chip>
                            {chat.archivedAt ? (
                                <Chip color="warning" size="sm" variant="soft">
                                    <Chip.Label>Archived</Chip.Label>
                                </Chip>
                            ) : null}
                        </span>
                    }
                    title={`#${project.name}`}
                />
            </div>
            <SettingsRowError>{update.error?.message}</SettingsRowError>
        </div>
    );
}

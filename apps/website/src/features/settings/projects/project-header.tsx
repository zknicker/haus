import type { Chat, Project } from '@haus/api';
import { Chip } from '@heroui/react';
import * as React from 'react';
import { useChannelUpdate } from '../../../hooks/servers/use-channel-update.ts';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import type { ChannelAppearance } from '../../chats/channel-appearance-fields.tsx';
import { ChannelAppearancePicker } from '../../chats/channel-appearance-picker.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';
import { appearanceChange } from './appearance-change.ts';

export function ProjectHeader({ chat, project }: { chat: Chat; project: Project }) {
    const update = useChannelUpdate(chat);
    const utils = hausTrpc.useUtils();
    const [draft, setDraft] = React.useState<ChannelAppearance | null>(null);
    const saving = React.useRef(0);
    const shown = draft ?? { color: chat.color, icon: chat.icon };
    const pick = (next: ChannelAppearance) => {
        const change = appearanceChange(shown, next);
        if (Object.keys(change).length === 0) {
            return;
        }
        setDraft(next);
        saving.current += 1;
        update
            .mutateAsync({ chatId: chat.id, serverId: chat.serverId, ...change })
            .catch(() => undefined)
            .then(() => utils.chat.list.invalidate({ serverId: chat.serverId }))
            .finally(() => {
                saving.current -= 1;
                if (saving.current === 0) {
                    setDraft(null);
                }
            });
    };

    return (
        <div>
            <div className="flex min-w-0 items-center gap-3">
                <ChannelAppearancePicker
                    appearance={shown}
                    isDisabled={Boolean(chat.archivedAt)}
                    onChange={pick}
                />
                <SettingsPageHeader
                    meta={
                        chat.archivedAt ? (
                            <Chip color="warning" size="sm" variant="soft">
                                <Chip.Label>Archived</Chip.Label>
                            </Chip>
                        ) : undefined
                    }
                    title={`#${project.name}`}
                />
            </div>
            <SettingsRowError>{update.error?.message}</SettingsRowError>
        </div>
    );
}

import { type Chat, channelDescriptionMaxLength, type Project } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Input, Separator, TextField } from '@heroui/react';
import * as React from 'react';
import { useChannelUpdate } from '../../../hooks/servers/use-channel-update.ts';
import { channelHandleIssue } from '../../chats/channel-handle.ts';
import {
    normalizeProjectKey,
    projectKeyIssue,
    projectKeyRefusal,
} from '../../chats/project-key.ts';
import { SettingsFact, SettingsRowError } from '../layout/settings-text.tsx';
import { ProjectMachineRow } from './project-machine-row.tsx';

export function ProjectGeneralSection({ chat, project }: { chat: Chat; project: Project }) {
    const isDisabled = Boolean(chat.archivedAt);
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>General</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                <ProjectNameRow chat={chat} isDisabled={isDisabled} key={chat.name} />
                <Separator />
                <ProjectDescriptionRow
                    chat={chat}
                    isDisabled={isDisabled}
                    key={chat.description ?? ''}
                />
                <Separator />
                <ProjectKeyRow
                    chat={chat}
                    isDisabled={isDisabled}
                    key={project.key}
                    project={project}
                />
                <Separator />
                <ProjectMachineRow isDisabled={isDisabled} project={project} />
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function ProjectNameRow({ chat, isDisabled }: { chat: Chat; isDisabled: boolean }) {
    const update = useChannelUpdate(chat);
    const current = chat.name ?? '';
    const [name, setName] = React.useState(current);
    const issue = channelHandleIssue(name);
    const save = () => {
        const next = name.trim();
        if (!next || next === current) {
            setName(current);
            return;
        }
        if (issue || update.error) {
            return;
        }
        update.mutate({ chatId: chat.id, name: next, serverId: chat.serverId });
    };

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Name</ItemCard.Title>
                <SettingsRowError>{issue ?? update.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                <TextField
                    aria-label="Project name"
                    className="w-64 max-w-full"
                    isDisabled={isDisabled || update.isPending}
                    isInvalid={Boolean(issue ?? update.error)}
                    onBlur={save}
                    onChange={(value) => {
                        update.reset();
                        setName(value);
                    }}
                    onKeyDown={blurOnEnter}
                    value={name}
                >
                    <Input placeholder="planning" />
                </TextField>
            </ItemCard.Action>
        </ItemCard>
    );
}

function ProjectDescriptionRow({ chat, isDisabled }: { chat: Chat; isDisabled: boolean }) {
    const update = useChannelUpdate(chat);
    const current = chat.description ?? '';
    const [description, setDescription] = React.useState(current);
    const save = () => {
        const next = description.trim();
        if (next === current) {
            setDescription(current);
            return;
        }
        if (update.error) {
            return;
        }
        update.mutate({ chatId: chat.id, description: next, serverId: chat.serverId });
    };

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Description</ItemCard.Title>
                <ItemCard.Description>Tells Captains what belongs here.</ItemCard.Description>
                <SettingsRowError>{update.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                <TextField
                    aria-label="Project description"
                    className="w-64 max-w-full"
                    isDisabled={isDisabled || update.isPending}
                    isInvalid={Boolean(update.error)}
                    maxLength={channelDescriptionMaxLength}
                    onBlur={save}
                    onChange={(value) => {
                        update.reset();
                        setDescription(value);
                    }}
                    onKeyDown={blurOnEnter}
                    value={description}
                >
                    <Input placeholder="What this project is for" />
                </TextField>
            </ItemCard.Action>
        </ItemCard>
    );
}

function ProjectKeyRow({
    chat,
    isDisabled,
    project,
}: {
    chat: Chat;
    isDisabled: boolean;
    project: Project;
}) {
    const update = useChannelUpdate(chat);
    const [key, setKey] = React.useState(project.key);
    const issue = projectKeyIssue(key) ?? projectKeyRefusal(update.error);
    const save = () => {
        if (!key || key === project.key) {
            setKey(project.key);
            return;
        }
        if (issue || update.error) {
            return;
        }
        update.mutate({ chatId: chat.id, key, serverId: chat.serverId });
    };

    if (!project.keyEditable) {
        return (
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Task key</ItemCard.Title>
                    <ItemCard.Description>{taskKeyDescription}</ItemCard.Description>
                </ItemCard.Content>
                <ItemCard.Action>
                    <SettingsFact>{project.key}</SettingsFact>
                </ItemCard.Action>
            </ItemCard>
        );
    }
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Task key</ItemCard.Title>
                <ItemCard.Description>{taskKeyDescription}</ItemCard.Description>
                <SettingsRowError>{issue ?? update.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                <TextField
                    aria-label="Task key"
                    className="w-24"
                    isDisabled={isDisabled || update.isPending}
                    isInvalid={Boolean(issue)}
                    onBlur={save}
                    onChange={(value) => {
                        update.reset();
                        setKey(normalizeProjectKey(value));
                    }}
                    onKeyDown={blurOnEnter}
                    value={key}
                >
                    <Input placeholder="OPS" />
                </TextField>
            </ItemCard.Action>
        </ItemCard>
    );
}

const taskKeyDescription = 'Prefixes Task numbers. Fixed after the first Task.';

function blurOnEnter(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.target.blur();
    }
}

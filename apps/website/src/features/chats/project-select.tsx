import type { Project } from '@haus/api';
import { Autocomplete, Label, ListBox, SearchField, Separator } from '@heroui/react';
import { Add01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useProjects } from '../../hooks/projects/use-projects.ts';
import { useChatAppearances } from '../../hooks/servers/use-chats.ts';
import { useCreateServerChannel } from '../../hooks/servers/use-create-server-channel.ts';
import { matchesProjectSearch, projectChoice, projectChoices } from '../../lib/project-homes.ts';
import { ChannelCreateDialog } from './channel-create-dialog.tsx';

const newProjectKey = 'new-project';

export function ProjectSelect({
    'aria-label': ariaLabel,
    children,
    className,
    except,
    fullWidth,
    isDisabled,
    onSelect,
    placeholder = 'Select a project',
    serverId,
    value,
}: {
    'aria-label'?: string;
    children?: React.ReactNode;
    className?: string;
    except?: string;
    fullWidth?: boolean;
    isDisabled?: boolean;
    onSelect: (projectId: string) => void;
    placeholder?: string;
    serverId: string;
    value: string | null;
}) {
    const projects = useProjects(serverId).data ?? noProjects;
    const chats = useChatAppearances(serverId);
    const create = useCreateServerChannel();
    const [creating, setCreating] = React.useState(false);
    const choices = projectChoices(projects, chats, except);
    const current = projects.find((project) => project.chatId === value);
    const created = create.data?.chat.id === value ? create.data : undefined;
    const selected =
        (current && projectChoice(current, chats.get(current.chatId))) ??
        (created ? projectChoice(created.project, created.chat) : null);

    return (
        <>
            <Autocomplete
                aria-label={ariaLabel}
                className={className}
                fullWidth={fullWidth}
                isDisabled={isDisabled}
                onChange={(key) => {
                    if (key === newProjectKey) {
                        create.reset();
                        setCreating(true);
                    } else if (typeof key === 'string' && key !== value) {
                        onSelect(key);
                    }
                }}
                placeholder={placeholder}
                value={value}
                variant="secondary"
            >
                {children}
                <Autocomplete.Trigger>
                    <Autocomplete.Value>
                        {({ defaultChildren }) =>
                            selected ? (
                                <span className="flex min-w-0 items-center gap-2">
                                    <ChannelIconBox
                                        color={selected.color}
                                        icon={selected.icon}
                                        size="inline"
                                    />
                                    <span className="truncate">{selected.name}</span>
                                </span>
                            ) : (
                                defaultChildren
                            )
                        }
                    </Autocomplete.Value>
                    <Autocomplete.Indicator />
                </Autocomplete.Trigger>
                <Autocomplete.Popover>
                    <Autocomplete.Filter
                        filter={(textValue, input, node) =>
                            node.key === newProjectKey || matchesProjectSearch(textValue, input)
                        }
                    >
                        <SearchField
                            aria-label="Search projects"
                            autoFocus
                            name="project-search"
                            variant="secondary"
                        >
                            <SearchField.Group>
                                <SearchField.SearchIcon />
                                <SearchField.Input placeholder="Search projects" />
                                <SearchField.ClearButton />
                            </SearchField.Group>
                        </SearchField>
                        <ListBox>
                            {choices.length > 0 ? (
                                <>
                                    <ListBox.Section>
                                        {choices.map((choice) => (
                                            <ListBox.Item
                                                id={choice.chatId}
                                                key={choice.chatId}
                                                textValue={choice.name}
                                            >
                                                <ChannelIconBox
                                                    color={choice.color}
                                                    icon={choice.icon}
                                                    size="inline"
                                                />
                                                <Label>{choice.name}</Label>
                                                <ListBox.ItemIndicator />
                                            </ListBox.Item>
                                        ))}
                                    </ListBox.Section>
                                    <Separator />
                                </>
                            ) : null}
                            <ListBox.Section>
                                <ListBox.Item id={newProjectKey} textValue="New project">
                                    <span className="text-muted flex size-5 shrink-0 items-center justify-center">
                                        <Icon aria-hidden="true" icon={Add01Icon} size={16} />
                                    </span>
                                    <Label>New project</Label>
                                </ListBox.Item>
                            </ListBox.Section>
                        </ListBox>
                    </Autocomplete.Filter>
                </Autocomplete.Popover>
            </Autocomplete>
            <ChannelCreateDialog
                errorMessage={create.error?.message ?? null}
                isPending={create.isPending}
                onClose={() => setCreating(false)}
                onSubmit={async ({ color, icon, name }) => {
                    const { chat } = await create.mutateAsync({ color, icon, name, serverId });
                    setCreating(false);
                    onSelect(chat.id);
                }}
                open={creating}
            />
        </>
    );
}

const noProjects: readonly Project[] = [];

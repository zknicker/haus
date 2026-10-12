import { Kbd } from '@heroui/react';
import { Command } from '@heroui-pro/react';
import { Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { AppCommand, AppCommandGroup } from '../../commands/types.ts';
import { getCommandSearchText } from '../../commands/types.ts';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useCommandMenu } from './command-menu-provider.tsx';

export type AgentAvatarLookup = (agentId: string | null | undefined) => string | null;

export function CommandMenuShell({
    children,
    commandGroups,
    lookupAgentAvatarUrl,
}: {
    /** Result groups rendered above the commands, e.g. message matches. */
    children?: ReactNode;
    commandGroups: AppCommandGroup[];
    lookupAgentAvatarUrl: AgentAvatarLookup;
}) {
    const { isOpen, query, setOpen, setQuery } = useCommandMenu();
    const commandsById = useMemo(() => {
        const lookup = new Map<string, AppCommand>();

        for (const group of commandGroups) {
            for (const command of group.commands) {
                lookup.set(command.id, command);
            }
        }

        return lookup;
    }, [commandGroups]);

    const runCommand = (key: string | number) => {
        const command = commandsById.get(String(key));

        if (!command || command.disabledReason) {
            return;
        }

        void command.run();
        setOpen(false);
    };

    return (
        <Command>
            <Command.Backdrop isOpen={isOpen} onOpenChange={setOpen}>
                <Command.Container size="lg">
                    <Command.Dialog
                        aria-label="Command menu"
                        inputValue={query}
                        onInputChange={setQuery}
                    >
                        <Command.InputGroup>
                            <Command.InputGroup.Prefix>
                                <Icon icon={Search01Icon} />
                            </Command.InputGroup.Prefix>
                            <Command.InputGroup.Input placeholder="Search or run a command..." />
                            <Command.InputGroup.ClearButton />
                        </Command.InputGroup>
                        <Command.List
                            aria-label="Commands"
                            onAction={runCommand}
                            renderEmptyState={() => 'No matching commands.'}
                        >
                            {children}
                            {commandGroups.map((group) => (
                                <Command.Group heading={group.title} key={group.id}>
                                    {group.commands.map((command) => (
                                        <Command.Item
                                            id={command.id}
                                            {...(command.opensPage ? opensPlace : {})}
                                            isDisabled={Boolean(command.disabledReason)}
                                            key={command.id}
                                            textValue={getCommandSearchText(command)}
                                        >
                                            <CommandMenuIcon
                                                command={command}
                                                lookupAgentAvatarUrl={lookupAgentAvatarUrl}
                                            />
                                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                <span className="truncate font-medium">
                                                    {command.title}
                                                </span>
                                                {command.disabledReason ? (
                                                    <span className="truncate text-muted text-sm">
                                                        {command.disabledReason}
                                                    </span>
                                                ) : null}
                                            </span>
                                            {command.shortcut ? (
                                                <kbd>{command.shortcut}</kbd>
                                            ) : null}
                                        </Command.Item>
                                    ))}
                                </Command.Group>
                            ))}
                        </Command.List>
                        <Command.Footer>
                            <span className="flex items-center gap-2">
                                <Kbd>
                                    <Kbd.Content>Return</Kbd.Content>
                                </Kbd>
                                Run
                            </span>
                            <span className="flex items-center gap-2">
                                <Kbd>
                                    <Kbd.Content>Esc</Kbd.Content>
                                </Kbd>
                                Close
                            </span>
                        </Command.Footer>
                    </Command.Dialog>
                </Command.Container>
            </Command.Backdrop>
        </Command>
    );
}

function CommandMenuIcon({
    command,
    lookupAgentAvatarUrl,
}: {
    command: AppCommand;
    lookupAgentAvatarUrl: AgentAvatarLookup;
}) {
    if (typeof command.icon === 'object' && 'kind' in command.icon) {
        if (command.icon.kind === 'channel') {
            return (
                <ChannelIconBox color={command.icon.color} icon={command.icon.icon} size="inline" />
            );
        }

        return (
            <EntityAvatar
                name={command.icon.fallbackLabel}
                size={20}
                src={lookupAgentAvatarUrl(command.icon.agentId)}
            />
        );
    }

    return <Icon aria-hidden="true" icon={command.icon} />;
}

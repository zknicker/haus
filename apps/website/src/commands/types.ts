import type { IconSvgElement } from '@hugeicons/react';

export type AppCommandIcon =
    | IconSvgElement
    | {
          color: string | null;
          icon: string | null;
          kind: 'channel';
      }
    | {
          agentId: string | null;
          fallbackLabel: string;
          kind: 'agent-avatar';
      };

export interface AppCommand {
    disabledReason?: string | null;
    icon: AppCommandIcon;
    id: string;
    keywords?: readonly string[];
    /** The command opens a page, so a middle-click on it opens a background tab (desktop). */
    opensPage?: boolean;
    run: () => void | Promise<void>;
    shortcut?: string;
    subtitle?: string;
    title: string;
}

export interface AppCommandGroup {
    commands: readonly AppCommand[];
    id: string;
    title: string;
}

export function getCommandSearchText(command: AppCommand) {
    return [command.title, command.subtitle, ...(command.keywords ?? [])]
        .filter(Boolean)
        .join('\n');
}

export function filterCommandGroups(groups: readonly AppCommandGroup[]) {
    return groups
        .map((group) => ({
            ...group,
            commands: group.commands.filter(Boolean),
        }))
        .filter((group) => group.commands.length > 0);
}

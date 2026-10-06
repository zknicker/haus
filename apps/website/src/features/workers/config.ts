import type { IconSvgElement } from '@hugeicons/react';
import { HourglassIcon, TerminalIcon, ZapIcon } from '@hugeicons-pro/core-duotone-rounded';
import type { TranscriptWorker } from '../chats/transcript-contract.ts';

export const workerKindConfig = {
    acp: {
        accent: 'var(--accent)',
        accentMuted: 'oklch(from var(--accent) l c h / 0.25)',
        bg: 'bg-accent/10',
        icon: ZapIcon,
        label: 'ACP',
    },
    cli: {
        accent: 'var(--accent)',
        accentMuted: 'oklch(from var(--accent) l c h / 0.25)',
        bg: 'bg-accent/10',
        icon: TerminalIcon,
        label: 'CLI',
    },
    cron: {
        accent: 'var(--warning)',
        accentMuted: 'oklch(from var(--warning) l c h / 0.25)',
        bg: 'bg-warning/10',
        icon: HourglassIcon,
        label: 'Cron',
    },
} satisfies Record<
    TranscriptWorker['kind'],
    {
        accent: string;
        accentMuted: string;
        bg: string;
        icon: IconSvgElement;
        label: string;
    }
>;

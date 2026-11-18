import {
    AiMagicIcon,
    BrowserIcon,
    BubbleChatQuestionIcon,
    CommandLineIcon,
    FileEditIcon,
    FileSearchIcon,
    GlobalSearchIcon,
    ToolsIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { HugeiconsIconProps } from '@hugeicons/react';

export type ToolStepIcon = HugeiconsIconProps['icon'];

// One icon vocabulary for tool presentation: inline rows and the work-group
// header resolve through the same mapping so a group summarizing one tool
// kind carries that tool's icon.
export function resolveToolStepIcon(name: string): ToolStepIcon {
    const normalized = name.trim().toLowerCase();

    if (matchesAny(normalized, ['bash', 'command', 'exec', 'shell', 'terminal', 'zsh'])) {
        return CommandLineIcon;
    }

    if (normalized === 'clarify') {
        return BubbleChatQuestionIcon;
    }

    if (normalized === 'workspace_changes' || isEditTool(normalized)) {
        return FileEditIcon;
    }

    if (normalized.includes('web')) {
        return GlobalSearchIcon;
    }

    if (matchesAny(normalized, ['read', 'grep', 'search', 'code'])) {
        return FileSearchIcon;
    }

    if (normalized.includes('skill')) {
        return AiMagicIcon;
    }

    if (matchesAny(normalized, ['browser', 'open', 'click'])) {
        return BrowserIcon;
    }

    return ToolsIcon;
}

export function isEditTool(normalizedName: string) {
    return matchesAny(normalizedName, ['edit', 'write', 'patch', 'replace']);
}

export const genericToolStepIcon = ToolsIcon;

function matchesAny(value: string, needles: string[]) {
    return needles.some((needle) => value.includes(needle));
}

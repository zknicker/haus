import type { IconSvgElement } from '@hugeicons/react';
import {
    Alert02Icon,
    ArrowShrinkIcon,
    BubbleChatIcon,
    CancelCircleIcon,
    CommandLineIcon,
    File01Icon,
    FileAddIcon,
    FileEditIcon,
    FileSearchIcon,
    FileSyncIcon,
    Globe02Icon,
    Image01Icon,
    Plug01Icon,
    RoboticIcon,
    StopCircleIcon,
    Video01Icon,
    Wrench01Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { TurnTraceStatus, TurnTraceToolKind } from './turn-trace-tool-model.ts';

/** A row's leading mark: what kind of work it was, unless its outcome says more. */
export interface TraceMark {
    readonly icon: IconSvgElement;
    readonly tone: 'danger' | 'muted' | 'warning';
}

const kindIcons: Record<TurnTraceToolKind, IconSvgElement> = {
    compaction: ArrowShrinkIcon,
    'file-change': FileSyncIcon,
    'file-edit': FileEditIcon,
    'file-read': File01Icon,
    'file-write': FileAddIcon,
    generic: Wrench01Icon,
    image: Image01Icon,
    mcp: Plug01Icon,
    message: BubbleChatIcon,
    search: FileSearchIcon,
    shell: CommandLineIcon,
    subagent: RoboticIcon,
    web: Globe02Icon,
};

export function traceMark(
    kind: TurnTraceToolKind,
    status: TurnTraceStatus,
    media: 'image' | 'video' | null = null
): TraceMark {
    if (status === 'failed') {
        return { icon: CancelCircleIcon, tone: 'danger' };
    }
    if (status === 'warning') {
        return { icon: Alert02Icon, tone: 'warning' };
    }
    if (status === 'interrupted') {
        return { icon: StopCircleIcon, tone: 'muted' };
    }
    return { icon: media === 'video' ? Video01Icon : kindIcons[kind], tone: 'muted' };
}

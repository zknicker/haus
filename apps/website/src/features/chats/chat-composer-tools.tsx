import { PromptInput } from '@heroui-pro/react';
import { Attachment01Icon } from '@hugeicons-pro/core-stroke-rounded';

import { Icon } from '../../components/ui/icon.tsx';
import type { ChatContextFullness } from './chat-context-fullness.ts';

export function ChatComposerAttachmentButton({
    isDisabled,
    onPress,
}: {
    isDisabled?: boolean;
    onPress: () => void;
}) {
    return (
        <PromptInput.Action
            aria-label="Attach file"
            isDisabled={isDisabled}
            onPress={onPress}
            tooltip={isDisabled ? 'Attachments are not available right now.' : 'Attach file'}
        >
            <Icon className="size-4" icon={Attachment01Icon} />
        </PromptInput.Action>
    );
}

export function ChatComposerContextFullness({ fullness }: { fullness: ChatContextFullness }) {
    const radius = 7;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - fullness.percent);
    const percentLabel = `${Math.round(fullness.percent * 100)}%`;

    return (
        <div
            className="text-muted flex items-center gap-1.5 text-xs"
            title={`${percentLabel} context used`}
        >
            <svg aria-hidden="true" className="size-4 -rotate-90" viewBox="0 0 20 20">
                <circle
                    className="stroke-current opacity-30"
                    cx="10"
                    cy="10"
                    fill="none"
                    r={radius}
                    strokeWidth="3"
                />
                <circle
                    className="stroke-current"
                    cx="10"
                    cy="10"
                    fill="none"
                    r={radius}
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    strokeWidth="3"
                />
            </svg>
            <span className="tabular-nums">{percentLabel}</span>
        </div>
    );
}

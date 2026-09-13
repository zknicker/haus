import type { AskStatus } from '@haus/api';
import { BubbleChatQuestionIcon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { askMarkerLabel } from './ask-presentation.ts';

export interface MessageAskProfile {
    avatarUrl: null | string;
    name: string;
}

/**
 * One Ask as it reads on its Message: the Ask glyph, the addressee whose
 * decision it waits on, and its open status. Answered Asks render nothing.
 * Task-chip grammar — annotation
 * scale, neutral throughout, with only the status disc carrying lifecycle
 * color.
 */
export function MessageAskMarker({
    addresseeProfile,
    status,
}: {
    addresseeProfile: MessageAskProfile | null;
    status: AskStatus;
}) {
    if (status === 'answered') {
        return null;
    }

    return (
        <span
            // Annotation scale, matching the author line — without an explicit
            // size it inherits the message container and outgrows the body text.
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-semibold text-muted text-sm"
            data-testid="message-ask-marker"
        >
            <Icon className="size-3.5 shrink-0" icon={BubbleChatQuestionIcon} />
            <span className="shrink-0">{askMarkerLabel}</span>
            {addresseeProfile ? (
                <span className="flex min-w-0 items-center gap-1.5">
                    <EntityAvatar
                        name={addresseeProfile.name}
                        size={14}
                        src={addresseeProfile.avatarUrl}
                    />
                    <span className="truncate">{addresseeProfile.name}</span>
                </span>
            ) : null}
            <svg
                aria-hidden="true"
                className="size-[15px] shrink-0 text-accent"
                viewBox="0 0 16 16"
            >
                <circle cx="8" cy="8" fill="none" r="6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className="shrink-0">· Awaiting answer</span>
        </span>
    );
}

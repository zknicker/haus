import type { OpenThreadState } from '@haus/api';
import {
    Alert02Icon,
    Cancel01Icon,
    CheckmarkCircle02Icon,
    Clock01Icon,
    CloudIcon,
    GitMergeIcon,
    GitPullRequestDraftIcon,
    GitPullRequestIcon,
    Loading03Icon,
    Message01Icon,
    Tick02Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';

const glyphs: Record<OpenThreadState, { className: string; icon: typeof Tick02Icon }> = {
    active: { className: 'text-muted', icon: Message01Icon },
    approved: { className: 'text-success', icon: CheckmarkCircle02Icon },
    'changes-requested': { className: 'text-warning', icon: Alert02Icon },
    'checks-failing': { className: 'text-danger', icon: Alert02Icon },
    'checks-running': { className: 'text-muted', icon: Loading03Icon },
    done: { className: 'text-muted', icon: Tick02Icon },
    draft: { className: 'text-muted', icon: GitPullRequestDraftIcon },
    'job-failed': { className: 'text-danger', icon: Alert02Icon },
    merged: { className: 'text-muted', icon: GitMergeIcon },
    'needs-input': { className: 'text-muted', icon: Clock01Icon },
    'pr-closed': { className: 'text-muted', icon: Cancel01Icon },
    'ready-for-review': { className: 'text-accent', icon: GitPullRequestIcon },
    recent: { className: 'text-muted', icon: Message01Icon },
    unread: { className: 'text-accent', icon: Message01Icon },
    working: { className: 'text-muted', icon: Loading03Icon },
};

/** A Thread's status mark. States differ by shape as well as color. */
export function OpenThreadGlyph({ size = 16, state }: { size?: number; state: OpenThreadState }) {
    const { className, icon } = glyphs[state];
    return (
        <Icon
            aria-hidden="true"
            className={cn('shrink-0', className)}
            icon={icon}
            size={size}
            style={{ height: size, width: size }}
        />
    );
}

/**
 * A Thread holding Cloud Agent work, as its sidebar row leads: the cloud
 * worker in its state's tone, so a failing or reviewable job reads at a glance.
 */
export function OpenThreadWorkGlyph({
    size = 16,
    state,
}: {
    size?: number;
    state: OpenThreadState;
}) {
    return (
        <Icon
            aria-hidden="true"
            className={cn('shrink-0', glyphs[state].className)}
            icon={CloudIcon}
            size={size}
            style={{ height: size, width: size }}
        />
    );
}

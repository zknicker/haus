import type { WidgetArtifactProps } from '@haus/api/widgets/artifact';
import { File01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import { useArtifactPanelOpen } from './artifact-panel-context.tsx';

/**
 * Compact transcript card for an agent artifact. The card itself reads
 * nothing — clicking opens the workspace HTML page in the artifact pane's
 * sandboxed preview with host tokens injected (its own workspace tab in desktop tabs). Outside a pane context
 * (static render, tests) the card is inert.
 */
export function WidgetArtifactCard({ props }: { props: WidgetArtifactProps }) {
    const openArtifactPanel = useArtifactPanelOpen();
    const fileName = props.path.split('/').filter(Boolean).at(-1) ?? props.path;
    const title = props.title ?? fileName;

    return (
        <button
            className={cn(
                'group card-shell flex w-full max-w-[28rem] items-center gap-3 border border-border bg-surface-secondary/65 px-3.5 py-3 text-left',
                'transition-colors',
                openArtifactPanel
                    ? 'cursor-(--cursor-interactive) hover:border-border-secondary hover:bg-surface-tertiary/70'
                    : 'cursor-default'
            )}
            onClick={() => openArtifactPanel?.({ kind: 'workspaceFile', path: props.path }, title)}
            type="button"
        >
            <span className="card-shell flex size-9 shrink-0 items-center justify-center border border-border/70 bg-default/35">
                <Icon className="size-4 text-muted" icon={File01Icon} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground text-sm leading-5">
                    {title}
                </span>
                <span className="block truncate text-muted text-sm leading-5">
                    Page · {props.path}
                </span>
            </span>
            <span className="shrink-0 text-muted text-sm group-hover:text-foreground">Open</span>
        </button>
    );
}

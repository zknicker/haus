import { ArrowRight01Icon, FileEditIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import { useTranscriptRenderContextOptional } from './chat-transcript-render-context.tsx';
import { ServerTurnDetailsDrawer } from './server-turn-details-drawer.tsx';
import type { ToolStepRow } from './tool-steps/types.ts';

// Timeline affordance for turn file-change evidence: a compact card under the
// agent's reply proving the turn really touched files. Opens the same
// Workspace Changes drawer as the turn-details row.
export function WorkspaceChangesChip({ row }: { chatId?: string; row: ToolStepRow }) {
    const [open, setOpen] = React.useState(false);
    const context = useTranscriptRenderContextOptional();
    const agentId = row.actor?.kind === 'agent' ? row.actor.id : null;
    const actorProfile = context?.resolveActorProfile?.(row.actor);
    const label = row.toolCall.label || 'Changed files';

    return (
        <div className="w-full max-w-(--chat-card-width) py-0.5">
            <button
                aria-label={`${label} — view diffs`}
                className={cn(
                    // p-2 keeps the icon square evenly inset on every side; the
                    // trailing chevron gets a touch more room.
                    'group/files-chip flex w-full min-w-0 cursor-default items-center gap-2.5 rounded-xl border border-separator bg-surface p-2 pr-3 text-left outline-none transition-colors',
                    'hover:border-border hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus'
                )}
                onClick={() => setOpen(true)}
                type="button"
            >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-separator bg-surface-secondary">
                    <Icon className="size-4 text-muted" icon={FileEditIcon} strokeWidth={1.5} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
                    {label}
                </span>
                <Icon
                    className="size-4 shrink-0 text-muted transition-[color,translate] group-hover/files-chip:translate-x-0.5 group-hover/files-chip:text-foreground"
                    icon={ArrowRight01Icon}
                    strokeWidth={1.7}
                />
            </button>
            {context?.turnDetails && row.runId ? (
                <ServerTurnDetailsDrawer
                    access={context.turnDetails.access}
                    agentAvatarUrl={actorProfile?.avatarUrl}
                    agentId={agentId}
                    agentName={actorProfile?.name ?? 'Agent'}
                    onOpenChange={setOpen}
                    open={open}
                    runId={row.runId}
                    serverId={context.turnDetails.serverId}
                />
            ) : null}
        </div>
    );
}

export function isWorkspaceChangesToolRow(row: { kind: string; toolCall?: { name: string } }) {
    return row.kind === 'tool' && row.toolCall?.name === 'workspace_changes';
}

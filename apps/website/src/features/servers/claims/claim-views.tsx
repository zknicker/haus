import { Kanban } from '@heroui-pro/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { claimStatusLabels } from '../../claims/claim-presentation.ts';
import { LabelChip } from '../../tasks/label-chip.tsx';
import { taskPriorityLabels } from '../../tasks/task-presentation.ts';
import { TaskPriorityIcon } from '../../tasks/task-priority-icon.tsx';
import { TaskStatusDisc } from '../../tasks/task-status-disc.tsx';
import { ClaimActions } from './claim-actions.tsx';
import { ClaimContextMenu } from './claim-context-menu.tsx';
import { type ClaimItem, groupClaims, groupClaimsForList } from './claim-model.ts';

interface ClaimViewProps {
    claims: ClaimItem[];
    onOpenClaim: (claim: ClaimItem) => void;
}

export function ClaimBoard({ onOpenClaim, claims }: ClaimViewProps) {
    const groups = React.useMemo(() => groupClaims(claims), [claims]);

    return (
        <div className="min-h-0 flex-1 p-4">
            <Kanban>
                {groups.map((group) => (
                    <Kanban.Column key={group.status}>
                        <Kanban.ColumnHeader>
                            <Kanban.ColumnIndicator>
                                <TaskStatusDisc className="size-4" status={group.status} />
                            </Kanban.ColumnIndicator>
                            <Kanban.ColumnTitle>
                                {claimStatusLabels[group.status]}
                            </Kanban.ColumnTitle>
                            <Kanban.ColumnCount>{group.claims.length}</Kanban.ColumnCount>
                        </Kanban.ColumnHeader>
                        <Kanban.ColumnBody>
                            <Kanban.CardList
                                aria-label={`${claimStatusLabels[group.status]} tasks`}
                                items={group.claims}
                                renderEmptyState={() =>
                                    `No ${claimStatusLabels[group.status].toLowerCase()} tasks.`
                                }
                            >
                                {(claim) => (
                                    <Kanban.Card id={claim.id} textValue={claim.title}>
                                        <ClaimContextMenu claim={claim} onOpenClaim={onOpenClaim}>
                                            <ClaimSummary claim={claim} onOpen={onOpenClaim} />
                                            <ClaimActions claim={claim} />
                                        </ClaimContextMenu>
                                    </Kanban.Card>
                                )}
                            </Kanban.CardList>
                        </Kanban.ColumnBody>
                    </Kanban.Column>
                ))}
            </Kanban>
        </div>
    );
}

/**
 * Linear-style grouped list: collapsible status groups with dense
 * display-only rows; opening the claim is the row action, and metadata
 * edits live on the board cards and the claim thread.
 */
export function ClaimList({ onOpenClaim, claims }: ClaimViewProps) {
    const groups = React.useMemo(
        () => groupClaimsForList(claims).filter((group) => group.claims.length > 0),
        [claims]
    );

    return (
        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
            {groups.map((group) => (
                <ClaimListGroup
                    claims={group.claims}
                    key={group.key}
                    onOpen={onOpenClaim}
                    status={group.status}
                    title={group.title}
                />
            ))}
        </div>
    );
}

function ClaimListGroup({
    onOpen,
    status,
    claims,
    title,
}: {
    onOpen: (claim: ClaimItem) => void;
    status: ClaimItem['status'];
    claims: ClaimItem[];
    title: string;
}) {
    const [open, setOpen] = React.useState(true);

    return (
        // Each group closes with its own border: row dividers stop after the
        // last row, and this seam doubles as the line before the next header.
        <section className="border-separator border-b">
            <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-separator border-b bg-background/80 px-3 backdrop-blur">
                <button
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 cursor-[var(--cursor-interactive)] items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    onClick={() => setOpen((value) => !value)}
                    type="button"
                >
                    <Icon
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted transition-transform duration-150"
                        icon={ArrowRight01Icon}
                        style={{ transform: open ? 'rotate(90deg)' : 'none' }}
                    />
                    <TaskStatusDisc className="size-4" status={status} />
                    <span className="font-semibold text-foreground text-sm">{title}</span>
                    <span className="text-muted text-xs tabular-nums">{claims.length}</span>
                </button>
            </div>
            <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
            >
                <div className="overflow-hidden">
                    <div className="divide-y divide-separator">
                        {claims.map((claim) => (
                            <ClaimListRow
                                assigneeLabel={claim.assigneeLabel}
                                claim={claim}
                                key={claim.id}
                                onOpen={onOpen}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function ClaimListRow({
    assigneeLabel,
    onOpen,
    claim,
}: {
    assigneeLabel: string;
    onOpen: (claim: ClaimItem) => void;
    claim: ClaimItem;
}) {
    return (
        <ClaimContextMenu claim={claim} onOpenClaim={onOpen}>
            <button
                aria-label={rowAriaLabel(claim, assigneeLabel)}
                className="flex h-9 w-full cursor-[var(--cursor-interactive)] items-center gap-2 px-3 text-left outline-none hover:bg-background-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
                onClick={() => onOpen(claim)}
                type="button"
            >
                <TaskPriorityIcon className="size-4 text-muted" priority={claim.priority} />
                <span className="w-10 shrink-0 text-right font-mono text-muted text-xs tabular-nums">
                    #{claim.number}
                </span>
                <TaskStatusDisc className="size-4" status={claim.status} />
                <span className="min-w-0 flex-1 truncate text-foreground text-sm">
                    {claim.title}
                </span>
                <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
                    <ClaimBackgroundLabel tier={claim.tier} />
                    {claim.labels.map((label) => (
                        <LabelChip color={label.color} key={label.id} name={label.name} />
                    ))}
                    <span className="text-muted text-sm">{claim.chatLabel}</span>
                </div>
                <span className="hidden shrink-0 text-muted text-xs tabular-nums sm:inline">
                    <RelativeTime value={claim.updatedAt} />
                </span>
                <span className="shrink-0" title={assigneeLabel}>
                    {claim.assigneeAgentId !== null ? (
                        <EntityAvatar
                            name={assigneeLabel}
                            size={20}
                            src={claim.assigneeAvatarUrl}
                        />
                    ) : (
                        <span
                            aria-hidden="true"
                            className="block size-5 rounded-full border border-separator border-dashed"
                        />
                    )}
                </span>
            </button>
        </ClaimContextMenu>
    );
}

function rowAriaLabel(claim: ClaimItem, assigneeLabel: string) {
    const priority =
        claim.priority === 'none' ? '' : `, ${taskPriorityLabels[claim.priority]} priority`;
    const tier = claim.tier === 'background' ? ', background' : '';
    return `Open claim #${claim.number} ${claim.title}, ${assigneeLabel}${priority}${tier}`;
}

/**
 * What a widened lens is showing that the resting one was not. It is a plain
 * word rather than a chip: a background claim is an ordinary claim seen from a
 * lens the reader opened, not a claim with a special status.
 */
function ClaimBackgroundLabel({ tier }: { tier: ClaimItem['tier'] }) {
    if (tier !== 'background') {
        return null;
    }

    return <span className="shrink-0 font-normal text-muted text-xs">background</span>;
}

// The claim's own open affordance. Board cards and list rows both carry inline
// controls, so opening stays on an explicit button rather than a row action.
/**
 * The board card's read-only face. Priority and assignee are deliberately absent:
 * the editable controls below the summary already carry them, and printing them
 * twice made the card read like a debug dump.
 */
function ClaimSummary({ onOpen, claim }: { onOpen: (claim: ClaimItem) => void; claim: ClaimItem }) {
    return (
        <button
            aria-label={`Open claim #${claim.number} ${claim.title}`}
            className="block w-full min-w-0 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => onOpen(claim)}
            type="button"
        >
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-muted text-xs">
                <span className="truncate">
                    #{claim.number} · {claim.chatLabel}
                </span>
                <ClaimBackgroundLabel tier={claim.tier} />
            </span>
            <span className="mt-1 block font-medium text-foreground text-sm">{claim.title}</span>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {claim.labels.map((label) => (
                    <LabelChip color={label.color} key={label.id} name={label.name} />
                ))}
                <span className="text-muted text-xs">
                    <RelativeTime value={claim.updatedAt} />
                </span>
            </div>
        </button>
    );
}

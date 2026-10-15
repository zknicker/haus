import { Drawer } from '@heroui/react';
import { ChatMessage } from '@heroui-pro/react';
import type { HugeiconsIconProps } from '@hugeicons/react';
import {
    BrainIcon,
    Cancel01Icon,
    CompassIcon,
    DatabaseSyncIcon,
    InformationCircleIcon,
    Message01Icon,
    PackageIcon,
    ToolsIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { formatTimestamp } from '../../lib/format.ts';
import { AccessEventLogEntry } from '../sessions/log/event-entry/access-entry.tsx';
import { ArtifactLogEntry } from '../sessions/log/event-entry/artifact-entry.tsx';
import { DeliveryLogEntry } from '../sessions/log/event-entry/delivery-entry.tsx';
import { ActionTooltip } from './chat-action-tooltip.tsx';
import type { TranscriptRow } from './chat-transcript-model.ts';
import { ThinkingStep, ThinkingStepDetails } from './thinking-steps.tsx';

type StepIcon = HugeiconsIconProps['icon'];

type RuntimeNoticeRow = Extract<TranscriptRow, { kind: 'system'; systemKind: 'runtimeNotice' }>;
interface RuntimeNoticeSummary {
    description?: string;
    icon: StepIcon;
    label: string;
}

export function RuntimeNoticeEntry({ row }: { row: RuntimeNoticeRow }) {
    const [isOpen, setIsOpen] = React.useState(false);
    const summary = getRuntimeNoticeSummary(row);

    return (
        <div className="relative w-full px-3 py-1">
            <div className="w-[min(80%,52rem)] min-w-0">
                <ThinkingStep
                    className="-ml-2.5 [&>div]:gap-1.5"
                    icon={summary.icon}
                    index={0}
                    isLast
                    label={
                        <RuntimeNoticeLabel
                            isOpen={isOpen}
                            onOpenChange={setIsOpen}
                            row={row}
                            summary={summary}
                        />
                    }
                />
            </div>
        </div>
    );
}

export function SystemStep({
    animateEnter,
    currentSessionKey,
    index,
    isLast,
    row,
}: {
    animateEnter?: boolean;
    currentSessionKey?: string | null;
    index: number;
    isLast: boolean;
    row: Extract<TranscriptRow, { kind: 'system' }>;
}) {
    const body = getSystemBody({ currentSessionKey, row });
    const summary = getSystemSummary(row);

    return (
        <ThinkingStep
            animateEnter={animateEnter}
            description={summary.description}
            icon={summary.icon}
            index={index}
            isLast={isLast}
            label={summary.label}
            showIcon={summary.showIcon}
        >
            {body ? <ThinkingStepDetails summary="Details">{body}</ThinkingStepDetails> : null}
        </ThinkingStep>
    );
}

// Exported for the turn drawer, which renders system rows as ChainOfThought
// steps but reuses the same summaries and evidence bodies.
export function getSystemBody({
    currentSessionKey,
    row,
}: {
    currentSessionKey?: string | null;
    row: Extract<TranscriptRow, { kind: 'system' }>;
}) {
    switch (row.systemKind) {
        case 'accessEvent':
            return <AccessEventLogEntry entry={row} />;
        case 'artifact':
            return <ArtifactLogEntry entry={row} />;
        case 'delivery':
            return (
                <DeliveryLogEntry
                    currentSessionKey={currentSessionKey ?? row.delivery.parentSessionKey}
                    delivery={row.delivery}
                />
            );
        case 'runtimeNotice':
            return null;
        case 'thinking':
            return null;
        case 'turnStatus':
            return null;
    }
}

export function getSystemSummary(row: Extract<TranscriptRow, { kind: 'system' }>): {
    description?: string;
    icon: StepIcon;
    label: string;
    showIcon?: boolean;
} {
    switch (row.systemKind) {
        case 'accessEvent':
            return { icon: ToolsIcon, label: 'Checked access' };
        case 'artifact':
            return { icon: PackageIcon, label: 'Captured output' };
        case 'delivery':
            return { icon: Message01Icon, label: 'Delivered update' };
        case 'runtimeNotice': {
            const summary = getRuntimeNoticeSummary(row);
            return {
                description: summary.description,
                icon: summary.icon,
                label: summary.label,
            };
        }
        case 'thinking':
            return {
                ...parseThinkingSummary(row.thinking.text),
                icon: BrainIcon,
                showIcon: false,
            };
        case 'turnStatus':
            return {
                icon: Cancel01Icon,
                label: row.turnStatus.text,
            };
    }
}

export function parseThinkingSummary(text: string): {
    description?: string;
    label: string;
} {
    const trimmed = text.trim();
    const titleMatch = /^\*\*([^*\n][^*\n]*?)\*\*\s*([\s\S]*)$/u.exec(trimmed);

    if (!titleMatch) {
        return {
            description: trimmed || undefined,
            label: 'Thinking',
        };
    }

    const label = titleMatch[1]?.trim();
    const description = titleMatch[2]?.trim();

    return {
        description: description || undefined,
        label: label || 'Thinking',
    };
}

function getRuntimeNoticeSummary(row: RuntimeNoticeRow): RuntimeNoticeSummary {
    switch (row.runtimeNotice.kind) {
        case 'auto_compaction':
            return {
                description: formatCompactionDescription(row.runtimeNotice.compactionCount),
                icon: DatabaseSyncIcon,
                label: row.runtimeNotice.title,
            };
        case 'new_session':
            return {
                description: row.runtimeNotice.sessionId ?? row.runtimeNotice.detail ?? undefined,
                icon: CompassIcon,
                label: row.runtimeNotice.title,
            };
        case 'status':
            return {
                description:
                    row.runtimeNotice.text === row.runtimeNotice.title
                        ? undefined
                        : row.runtimeNotice.text,
                icon: InformationCircleIcon,
                label: row.runtimeNotice.title,
            };
    }
}

function formatCompactionDescription(count: number | null | undefined) {
    return typeof count === 'number' ? `count ${count}` : undefined;
}

// Hover affordance for a turn that opened a fresh session: an icon button in
// the turn's header actions (beside copy and turn details) that opens the
// notice drawer, instead of a standalone row ahead of the reply.
export function SessionNoticeAction({ row }: { row: RuntimeNoticeRow }) {
    const [isOpen, setIsOpen] = React.useState(false);
    const summary = getRuntimeNoticeSummary(row);

    return (
        <>
            <ActionTooltip label="Started a fresh session">
                <ChatMessage.Action
                    aria-label="Started a fresh session"
                    className="size-7 [&_svg]:size-3.5"
                    onPress={() => setIsOpen(true)}
                >
                    <Icon icon={summary.icon} strokeWidth={2} />
                </ChatMessage.Action>
            </ActionTooltip>
            <RuntimeNoticeDrawer
                isOpen={isOpen}
                onOpenChange={setIsOpen}
                row={row}
                summary={summary}
            />
        </>
    );
}

function RuntimeNoticeLabel({
    isOpen,
    onOpenChange,
    row,
    summary,
}: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    row: RuntimeNoticeRow;
    summary: RuntimeNoticeSummary;
}) {
    return (
        <>
            <button
                className="inline-flex min-w-0 max-w-full items-baseline gap-1.5 text-left hover:text-foreground"
                data-testid="runtime-notice-trigger"
                onClick={() => onOpenChange(true)}
                type="button"
            >
                <span className="truncate font-medium text-muted">{summary.label}</span>
            </button>
            <RuntimeNoticeDrawer
                isOpen={isOpen}
                onOpenChange={onOpenChange}
                row={row}
                summary={summary}
            />
        </>
    );
}

function RuntimeNoticeDrawer({
    isOpen,
    onOpenChange,
    row,
    summary,
}: {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    row: RuntimeNoticeRow;
    summary: RuntimeNoticeSummary;
}) {
    const details = runtimeNoticeDetails(row);

    return (
        <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
            <Drawer.Content placement="right">
                <Drawer.Dialog>
                    <Drawer.CloseTrigger />
                    <Drawer.Header>
                        <div className="flex items-center gap-3">
                            <div className="card-shell flex size-9 shrink-0 items-center justify-center border border-separator bg-surface-secondary">
                                <Icon
                                    className="size-[18px] text-muted"
                                    icon={summary.icon}
                                    strokeWidth={1.6}
                                />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <Drawer.Heading>{summary.label}</Drawer.Heading>
                                <p className="text-muted text-sm">Runtime notice</p>
                            </div>
                        </div>
                    </Drawer.Header>
                    <Drawer.Body>
                        <div className="flex min-w-0 flex-col gap-5">
                            <div className="card-shell flex flex-col gap-1 border border-separator bg-surface-secondary px-3 py-2.5">
                                {details.map((detail) => (
                                    <RuntimeNoticeMetaRow
                                        key={detail.label}
                                        label={detail.label}
                                        value={detail.value}
                                    />
                                ))}
                            </div>
                            {row.runtimeNotice.text ? (
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col gap-1">
                                        <h3 className="font-medium text-foreground text-sm">
                                            Raw engine notice
                                        </h3>
                                        <p className="max-w-[58ch] text-pretty text-muted text-sm">
                                            Original engine text captured before Haus rendered it as
                                            a runtime notice.
                                        </p>
                                    </div>
                                    <div className="card-shell border border-separator bg-surface-secondary px-3 py-2">
                                        <code className="break-all font-mono text-foreground text-sm leading-relaxed">
                                            {row.runtimeNotice.text}
                                        </code>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </Drawer.Body>
                </Drawer.Dialog>
            </Drawer.Content>
        </Drawer.Backdrop>
    );
}

function RuntimeNoticeMetaRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 text-sm">
            <span className="text-muted">{label}</span>
            <span className="min-w-0 break-all text-foreground">{value}</span>
        </div>
    );
}

function runtimeNoticeDetails(row: RuntimeNoticeRow) {
    const details = [
        { label: 'Notice type', value: formatNoticeKind(row.runtimeNotice.kind) },
        { label: 'Timestamp', value: formatTimestamp(row.timestamp) },
    ];

    if (typeof row.runtimeNotice.compactionCount === 'number') {
        details.push({
            label: 'Count',
            value: String(row.runtimeNotice.compactionCount),
        });
    }

    return details;
}

function formatNoticeKind(kind: RuntimeNoticeRow['runtimeNotice']['kind']) {
    switch (kind) {
        case 'auto_compaction':
            return 'Auto-compaction';
        case 'new_session':
            return 'New session';
        case 'status':
            return 'Status';
    }
}

import { ItemCard } from '@heroui-pro/react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { AgentAvatar } from '../members/agent-avatar.tsx';
import { WorkerKeycap } from '../workers/cloud-agent-provider-mark.tsx';
import { WorkerStatusDisc } from '../workers/worker-status-disc.tsx';
import type { HappeningNowRow } from './happening-now-rows.ts';
import { happeningNowWorkSubline } from './happening-now-work.ts';
import { StripListMark, StripListRow, stripMarkSize } from './strip-list-row.tsx';
import { StripRowList } from './strip-section-rows.tsx';

/**
 * What is moving right now, as one list: the Worker a delegation
 * left running, then the Agents currently in a turn. Both rows state elapsed
 * time, which is what separates working from stuck.
 *
 * It lives in the strip's popover, so each row stacks its
 * title over its subline. A work row's subline leads with its status — the
 * fact that changes while the row sits there — so when the column truncates,
 * the Chat and Agent it came from give way first; the status disc holds the
 * trailing edge.
 */
export function HappeningNowList({
    listId,
    onOpenRow,
    rows,
}: {
    /** Scopes layout animation, so this list never pairs rows with another strip list. */
    listId: string;
    onOpenRow: (row: HappeningNowRow) => void;
    rows: readonly HappeningNowRow[];
}) {
    return (
        <StripRowList
            emptyLabel="Nothing running."
            listId={listId}
            renderRow={(row) =>
                row.kind === 'work' ? (
                    <StripListRow label={row.work.title} onOpen={() => onOpenRow(row)}>
                        <StripListMark>
                            <span
                                className="flex items-center justify-center"
                                style={{ height: stripMarkSize, width: stripMarkSize }}
                            >
                                <WorkerKeycap provider={row.work.provider} size={stripMarkSize} />
                            </span>
                        </StripListMark>
                        <ItemCard.Content>
                            <ItemCard.Title>{row.work.title}</ItemCard.Title>
                            <ItemCard.Description>
                                {happeningNowWorkSubline(row.work)}
                            </ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <WorkerStatusDisc state={row.work.state} />
                        </ItemCard.Action>
                    </StripListRow>
                ) : (
                    // Named for the turn, not the Agent alone: the Agents list
                    // beside it already has a row that is the Agent.
                    <StripListRow
                        label={`${row.agent.name}: ${row.agent.step}`}
                        onOpen={() => onOpenRow(row)}
                    >
                        <StripListMark>
                            {row.agent.agent ? (
                                <AgentAvatar agent={row.agent.agent} size={stripMarkSize} />
                            ) : (
                                <EntityAvatar name={row.agent.name} size={stripMarkSize} />
                            )}
                        </StripListMark>
                        <ItemCard.Content>
                            <ItemCard.Title>{row.agent.name}</ItemCard.Title>
                            <ItemCard.Description>{row.agent.label}</ItemCard.Description>
                        </ItemCard.Content>
                    </StripListRow>
                )
            }
            rows={rows}
        />
    );
}

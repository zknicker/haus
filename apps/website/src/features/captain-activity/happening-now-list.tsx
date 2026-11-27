import { ItemCard } from '@heroui-pro/react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { AgentAvatar } from '../members/agent-avatar.tsx';
import type { HappeningNowRow } from './happening-now-rows.ts';
import { StripListMark, StripListRow, stripMarkSize } from './strip-list-row.tsx';
import { StripRowList } from './strip-section-rows.tsx';

/**
 * What is moving right now: the Agents currently in a turn, each with its
 * elapsed time, which is what separates working from stuck. It lives in the
 * strip's popover, so each row stacks its title over its subline.
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
            renderRow={(row) => (
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
            )}
            rows={rows}
        />
    );
}

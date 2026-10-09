import { findTimeChips, type TimeChipMatch } from '@haus/api';
import * as React from 'react';
import { deviceTimeZone, useViewerTimeZone } from '../../hooks/members/use-viewer-time-zone.ts';
import { getMentionAppearance } from './mention-appearance.tsx';
import { ReferenceChipView } from './reference-chip-view.tsx';
import { ReferencePreviewHeader, ReferencePreviewMark } from './reference-preview-header.tsx';
import {
    formatTimeChipLabel,
    formatTimeFromNow,
    type TimeChipContext,
    timeChipZoneRows,
} from './time-chip-format.ts';

/** Quoted text is someone else's words; its times stay as written. */
export const TimeChipQuoteContext = React.createContext(false);

/** Splits prose text into plain runs and time chips; the stored text never changes. */
export function renderTimeText(text: string, sentAt: Date, serverId?: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const match of findTimeChips(text, sentAt)) {
        parts.push(text.slice(cursor, match.start));
        parts.push(<TimeChip key={match.start} match={match} serverId={serverId} />);
        cursor = match.end;
    }
    parts.push(text.slice(cursor));
    return parts;
}

export function TimeChip({ match, serverId }: { match: TimeChipMatch; serverId?: string }) {
    if (React.use(TimeChipQuoteContext)) {
        return match.text;
    }
    return serverId ? (
        <SavedZoneTimeChip match={match} serverId={serverId} />
    ) : (
        <TimeChipView match={match} viewerZone={deviceTimeZone()} />
    );
}

function SavedZoneTimeChip({ match, serverId }: { match: TimeChipMatch; serverId: string }) {
    return <TimeChipView match={match} viewerZone={useViewerTimeZone(serverId)} />;
}

function TimeChipView({ match, viewerZone }: { match: TimeChipMatch; viewerZone: string }) {
    const context = { viewerZone };
    const startsAt = new Date(match.startsAt);
    const endsAt = match.endsAt ? new Date(match.endsAt) : undefined;
    const label = formatTimeChipLabel(startsAt, context, endsAt);
    return (
        <ReferenceChipView
            displayLabel={label}
            id={match.startsAt}
            kind="time"
            label={match.text}
            preview
            previewContent={
                <ReferencePreviewHeader
                    mark={<ReferencePreviewMark appearance={timeAppearance} />}
                    meta={formatTimeFromNow(startsAt, context)}
                    title={label}
                >
                    <TimeChipZones context={context} endsAt={endsAt} startsAt={startsAt} />
                </ReferencePreviewHeader>
            }
        />
    );
}

function TimeChipZones({
    context,
    endsAt,
    startsAt,
}: {
    context: TimeChipContext;
    endsAt?: Date;
    startsAt: Date;
}) {
    return (
        <dl className="flex flex-col gap-1.5">
            {timeChipZoneRows(startsAt, context, endsAt).map((row) => (
                <div className="flex min-w-0 flex-col" key={row.zone}>
                    <dt className="text-muted text-xs">{row.label}</dt>
                    <dd className="text-foreground text-sm">{row.time}</dd>
                </div>
            ))}
        </dl>
    );
}

const timeAppearance = getMentionAppearance({ id: '', kind: 'time', label: '' });

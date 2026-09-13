import { CloudAgentProviderGlyph } from '../../cloud-agents/cloud-agent-provider-mark.tsx';
import { CloudAgentStatusDisc } from '../../cloud-agents/cloud-agent-status-disc.tsx';
import type { HappeningNowRow } from './happening-now-rows.ts';
import {
    InboxGlyphMark,
    InboxIdentityMark,
    InboxRow,
    InboxRowBody,
    InboxRowMeta,
} from './inbox-row.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';

/**
 * What is moving right now, as one list: the Cloud Agent work a delegation
 * left running, then the Agents currently in a turn. Both rows state elapsed
 * time, which is what separates working from stuck.
 */
export function HappeningNowList({
    onOpenRow,
    rows,
}: {
    onOpenRow: (row: HappeningNowRow) => void;
    rows: readonly HappeningNowRow[];
}) {
    return (
        <InboxRowList
            emptyLabel="Nothing running."
            listId="inbox-happening-now"
            renderRow={(row) =>
                row.kind === 'work' ? (
                    <InboxRow label={row.work.title} onOpen={() => onOpenRow(row)}>
                        <InboxGlyphMark>
                            <CloudAgentProviderGlyph provider={row.work.provider} />
                        </InboxGlyphMark>
                        <InboxRowBody
                            preview={`${row.work.chatLabel} · ${row.work.agentName}`}
                            title={row.work.title}
                        />
                        {/* Status is the row's meta, not its preview: it is the
                            fact that changes while the row sits there, so it
                            keeps the fixed trailing column rather than
                            competing with the Chat it came from. */}
                        <InboxRowMeta>
                            <CloudAgentStatusDisc className="size-3.5" status={row.work.status} />
                            <span>{row.work.statusText}</span>
                        </InboxRowMeta>
                    </InboxRow>
                ) : (
                    <InboxRow label={row.agent.name} onOpen={() => onOpenRow(row)}>
                        <InboxIdentityMark agent={row.agent.agent} name={row.agent.name} />
                        <InboxRowBody preview={row.agent.label} title={row.agent.name} />
                    </InboxRow>
                )
            }
            rows={rows}
        />
    );
}

import type { AgentDreamDetail, AgentDreamFile } from '@haus/api';
import { Button, Chip } from '@heroui/react';
import { ItemCardGroup, Sheet } from '@heroui-pro/react';
import * as React from 'react';
import type { DiffHunk } from '../../../components/diff/diff-hunks.ts';
import { DiffHunks, DiffStatBadge } from '../../../components/diff/diff-view.tsx';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useAgentDream } from '../../../hooks/members/use-agent-dreams.ts';
import { formatShortTime } from '../../../lib/format.ts';
import { formatDayLabel, formatTurnDuration } from './agent-turn-row-model.ts';
import { dreamEmptyState, formatDreamHeadline, parseDreamPatch } from './dream-model.ts';
import { DreamFollowUpsGroup, DreamSummaryGroup } from './dream-sheet-sections.tsx';

/**
 * One dream's detail, in the same right sheet a Reminder or a Trigger opens in
 * (`reminder-sheet.tsx`), so the profile never grows to show a diff. The header
 * says when and what changed; the body is each file's unified diff through the
 * app's one diff renderer. The profile's Dreams list and the Activity log's
 * dream turn both open it by run.
 */
export function DreamSheet({
    agentId,
    onOpenChange,
    runId,
    serverId,
}: {
    agentId: string;
    onOpenChange: (open: boolean) => void;
    runId: string | null;
    serverId: string;
}) {
    // The panel animates itself out, so the last run is held until the next
    // open replaces it rather than emptying the panel mid-slide.
    const held = React.useRef(runId);
    if (runId) {
        held.current = runId;
    }
    const shown = runId ?? held.current;
    const dream = useAgentDream(serverId, agentId, shown);

    return (
        <Sheet isHandleOnly isOpen={runId !== null} onOpenChange={onOpenChange} placement="right">
            <Sheet.Backdrop>
                {/* Diffs need more measure than a Reminder's facts. */}
                <Sheet.Content className="w-[42rem]">
                    <Sheet.Dialog>
                        <Sheet.CloseTrigger />
                        {/* Blank while the detail reads; never a skeleton. */}
                        {dream.data ? (
                            <DreamDetail
                                dream={dream.data}
                                key={dream.data.runId}
                                onClose={() => onOpenChange(false)}
                                serverId={serverId}
                            />
                        ) : dream.data === null || dream.error ? (
                            <Sheet.Header>
                                <Sheet.Heading>Dream</Sheet.Heading>
                                <p className="mt-1.5 text-muted text-sm">
                                    {dream.error
                                        ? 'This dream is unavailable right now.'
                                        : 'No memory record was kept for this dream.'}
                                </p>
                            </Sheet.Header>
                        ) : null}
                    </Sheet.Dialog>
                </Sheet.Content>
            </Sheet.Backdrop>
        </Sheet>
    );
}

function DreamDetail({
    dream,
    onClose,
    serverId,
}: {
    dream: AgentDreamDetail;
    onClose: () => void;
    serverId: string;
}) {
    const now = useRelativeNow();
    const summary = dream.summary?.trim() || null;
    const hunks = React.useMemo(() => parseDreamPatch(dream.patch), [dream.patch]);
    const fileCount = dream.files.length;
    const emptyState = dreamEmptyState(dream);
    const durationMs = Date.parse(dream.finishedAt) - Date.parse(dream.startedAt);
    const fileHeadline = formatDreamHeadline(dream.files, hunks, dream.truncated);

    return (
        <>
            <Sheet.Header>
                {/* With a summary the heading stays short; the file headline moves under Memory changes. */}
                <Sheet.Heading>{summary ? 'Dream' : fileHeadline}</Sheet.Heading>
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-muted text-sm tabular-nums leading-5">
                    <span>
                        {`${formatDayLabel(new Date(dream.startedAt), now)} at ${formatShortTime(dream.startedAt)} · ${formatTurnDuration(durationMs)} · ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`}
                    </span>
                    <DiffStatBadge additions={dream.added} deletions={dream.removed} />
                </p>
            </Sheet.Header>
            <Sheet.Body>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
                    {summary ? <DreamSummaryGroup summary={summary} /> : null}
                    {dream.followUps.length > 0 ? (
                        <DreamFollowUpsGroup followUps={dream.followUps} serverId={serverId} />
                    ) : null}
                    <ItemCardGroup variant="transparent">
                        <ItemCardGroup.Header>
                            <ItemCardGroup.Title>Memory changes</ItemCardGroup.Title>
                            {summary ? (
                                <ItemCardGroup.Description>
                                    {fileHeadline}
                                </ItemCardGroup.Description>
                            ) : null}
                        </ItemCardGroup.Header>
                        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
                            {emptyState ? <p className="text-muted text-sm">{emptyState}</p> : null}
                            {dream.files.map((file) => (
                                <DreamFileDiff
                                    file={file}
                                    hunks={hunks.get(file.path)}
                                    key={file.path}
                                />
                            ))}
                        </div>
                    </ItemCardGroup>
                </div>
            </Sheet.Body>
            <Sheet.Footer>
                <Button onPress={onClose} type="button" variant="secondary">
                    Close
                </Button>
            </Sheet.Footer>
        </>
    );
}

const changeLabels: Record<AgentDreamFile['change'], string | null> = {
    added: 'New',
    deleted: 'Deleted',
    modified: null,
};

const omittedLabels: Record<NonNullable<AgentDreamFile['omitted']>, string> = {
    binary: 'Not a text file, so no diff is shown.',
    'too-large': 'Too large to show this diff.',
};

function DreamFileDiff({
    file,
    hunks,
}: {
    file: AgentDreamFile;
    hunks: readonly DiffHunk[] | undefined;
}) {
    const label = changeLabels[file.change];
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header className="flex items-center justify-between gap-3">
                <ItemCardGroup.Title className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate">{file.path}</span>
                    {label ? (
                        <Chip
                            color={file.change === 'added' ? 'success' : 'danger'}
                            size="sm"
                            variant="soft"
                        >
                            {label}
                        </Chip>
                    ) : null}
                </ItemCardGroup.Title>
                <DiffStatBadge additions={file.added} deletions={file.removed} />
            </ItemCardGroup.Header>
            {hunks && hunks.length > 0 ? (
                <DiffHunks hunks={hunks} />
            ) : (
                <p className="text-muted text-sm">
                    {file.omitted ? omittedLabels[file.omitted] : 'No text changes.'}
                </p>
            )}
        </ItemCardGroup>
    );
}

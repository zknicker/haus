import { Segment } from '@heroui-pro/react';
import { useSearchParams } from 'react-router-dom';

const viewParam = 'view';
const runParam = 'run';

export type ActivityView = 'heartbeats' | 'log';

/**
 * Which lens the Activity page shows, kept in the URL (`?view=heartbeats`; the
 * log is the bare page or `?view=log`) beside the Agent filter. `?run=<runId>`
 * asks the log to reveal that run.
 */
export function useActivityView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const view: ActivityView = searchParams.get(viewParam) === 'heartbeats' ? 'heartbeats' : 'log';
    return {
        /** A link target to the log with a run revealed, keeping the Agent filter. */
        readLogSearch: (runId: string | null) => {
            const updated = new URLSearchParams(searchParams);
            updated.set(viewParam, 'log');
            if (runId) {
                updated.set(runParam, runId);
            } else {
                updated.delete(runParam);
            }
            return `?${updated.toString()}`;
        },
        runId: searchParams.get(runParam),
        setView: (next: ActivityView) =>
            setSearchParams(
                (params) => {
                    const updated = new URLSearchParams(params);
                    updated.delete(runParam);
                    if (next === 'heartbeats') {
                        updated.set(viewParam, next);
                    } else {
                        updated.delete(viewParam);
                    }
                    return updated;
                },
                { replace: true }
            ),
        view,
    };
}

/** The Log | Heartbeats switch at the far end of the page's header band. */
export function ActivityViewSwitch({
    onChange,
    view,
}: {
    onChange: (view: ActivityView) => void;
    view: ActivityView;
}) {
    return (
        <Segment
            aria-label="Activity view"
            onSelectionChange={(key) => onChange(key === 'heartbeats' ? 'heartbeats' : 'log')}
            selectedKey={view}
            size="sm"
        >
            <Segment.Item id="log">Log</Segment.Item>
            <Segment.Item id="heartbeats">Heartbeats</Segment.Item>
        </Segment>
    );
}

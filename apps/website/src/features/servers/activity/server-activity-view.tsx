import { Segment } from '@heroui-pro/react';
import { useSearchParams } from 'react-router-dom';

const viewParam = 'view';
const runParam = 'run';

export type ActivityView = 'heartbeats' | 'log';

/**
 * Which lens the Activity page shows, kept in the URL (`?view=heartbeats`; the
 * log is the bare page) beside the Agent filter. `run` carries a run to reveal
 * once the log is showing, which is how a heartbeat's "Open trace" lands on it.
 */
export function useActivityView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const view: ActivityView = searchParams.get(viewParam) === 'heartbeats' ? 'heartbeats' : 'log';
    const update = (change: (params: URLSearchParams) => void) =>
        setSearchParams(
            (params) => {
                const next = new URLSearchParams(params);
                change(next);
                return next;
            },
            { replace: true }
        );
    return {
        openTrace: (runId: string) =>
            update((params) => {
                params.delete(viewParam);
                params.set(runParam, runId);
            }),
        revealRunId: view === 'log' ? searchParams.get(runParam) : null,
        setView: (next: ActivityView) =>
            update((params) => {
                params.delete(runParam);
                if (next === 'heartbeats') {
                    params.set(viewParam, next);
                } else {
                    params.delete(viewParam);
                }
            }),
        view,
    };
}

/** The Log | Heartbeats switch that ends the day bar, before the Agent filter. */
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

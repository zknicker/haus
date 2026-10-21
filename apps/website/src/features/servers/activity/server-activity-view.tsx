import { Segment } from '@heroui-pro/react';
import { useSearchParams } from 'react-router-dom';

const viewParam = 'view';

export type ActivityView = 'heartbeats' | 'log';

/**
 * Which lens the Activity page shows, kept in the URL (`?view=heartbeats`; the
 * log is the bare page) beside the Agent filter.
 */
export function useActivityView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const view: ActivityView = searchParams.get(viewParam) === 'heartbeats' ? 'heartbeats' : 'log';
    return {
        setView: (next: ActivityView) =>
            setSearchParams(
                (params) => {
                    const updated = new URLSearchParams(params);
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

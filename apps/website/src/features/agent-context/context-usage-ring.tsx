import { Button, Popover, ProgressCircle } from '@heroui/react';
import { useAgentContext } from '../../hooks/agents/use-agent-context.ts';
import { contextUsageView } from './context-usage-model.ts';

export function ContextUsageRing({ agentId, serverId }: { agentId: string; serverId: string }) {
    const snapshot = useAgentContext(serverId, agentId);
    if (!snapshot) {
        return null;
    }
    const view = contextUsageView(snapshot);
    return (
        <Popover>
            <Button aria-label={`Context: ${view.summary}`} isIconOnly size="sm" variant="ghost">
                <ProgressCircle
                    aria-label="Context used"
                    color={view.percent >= 90 ? 'warning' : 'default'}
                    size="sm"
                    value={Math.min(100, view.percent)}
                >
                    <ProgressCircle.Track>
                        <ProgressCircle.TrackCircle />
                        <ProgressCircle.FillCircle />
                    </ProgressCircle.Track>
                </ProgressCircle>
            </Button>
            <Popover.Content placement="top end">
                <Popover.Dialog aria-label="Context" className="w-72">
                    <ContextUsagePanel view={view} />
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}

export function ContextUsagePanel({ view }: { view: ReturnType<typeof contextUsageView> }) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
                <Popover.Heading className="text-sm font-medium">Context</Popover.Heading>
                <span className="text-muted text-sm tabular-nums">{view.summary}</span>
            </div>
            <div className="bg-default flex h-1.5 overflow-hidden rounded-full">
                {view.rows.map((row) => (
                    <span
                        className="h-full"
                        key={row.id}
                        style={{ backgroundColor: row.color, width: `${row.share * 100}%` }}
                    />
                ))}
            </div>
            <ul className="flex flex-col gap-1.5">
                {view.rows.map((row) => (
                    <li className="flex items-center gap-2 text-sm" key={row.id}>
                        <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                        />
                        <span className="flex-1">{row.label}</span>
                        <span className="text-muted tabular-nums">{row.tokens}</span>
                    </li>
                ))}
            </ul>
            <div className="border-separator flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>Compact at</span>
                <span className="tabular-nums">
                    <span className="font-medium">{view.compactAt}</span>
                    <span className="text-muted"> / {view.window}</span>
                </span>
            </div>
        </div>
    );
}

import type { contextUsageView } from './context-usage-model.ts';

export function ContextUsagePanel({ view }: { view: ReturnType<typeof contextUsageView> }) {
    return (
        <div className="flex h-full flex-col gap-2 text-xs">
            <div className="flex items-baseline justify-between gap-3">
                <span className="shrink-0 font-medium">Context</span>
                <span className="text-muted whitespace-nowrap tabular-nums">{view.summary}</span>
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
            <ul className="flex flex-col gap-1">
                {view.rows.map((row) => (
                    <li className="flex items-center gap-2" key={row.id}>
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
            <div className="border-separator mt-auto flex items-center justify-between rounded-lg border px-2.5 py-1.5">
                <span>Compact at</span>
                <span className="tabular-nums">
                    <span className="font-medium">{view.compactAt}</span>
                    <span className="text-muted"> / {view.window}</span>
                </span>
            </div>
        </div>
    );
}

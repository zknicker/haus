import { type WidgetRenderInput, widgetRenderInputSchema } from '@haus/api/widgets';
import { cn } from '../../lib/utils.ts';
import { WidgetArtifactCard } from './artifact-card.tsx';
import type { TranscriptWidgetRow } from './transcript-contract.ts';
import { VisualCard } from './visual-card.tsx';

export function AgentWidget({ row }: { row: TranscriptWidgetRow }) {
    const rendered = renderWidget(row);

    if (!rendered) {
        return (
            <WidgetFallback
                error={row.widget.validationError ?? 'Widget unavailable.'}
                text={row.widget.fallbackText}
            />
        );
    }

    return rendered;
}

function renderWidget(row: TranscriptWidgetRow) {
    const widget = row.widget;

    if (widget.validationError || widget.target !== 'chat.inline') {
        return null;
    }

    const parsed = widgetRenderInputSchema.safeParse({
        component: widget.component,
        fallback: { text: widget.fallbackText },
        props: widget.props,
        target: widget.target,
    });

    // Retired catalog widgets (pre-PRD-86 history) fail the parse and replay
    // as the fallback card.
    if (!parsed.success) {
        return null;
    }

    return <div className="flex max-w-[46rem] flex-col gap-3">{widgetElement(parsed.data)}</div>;
}

function widgetElement(input: WidgetRenderInput) {
    switch (input.component) {
        case 'haus.widget.artifact':
            return <WidgetArtifactCard props={input.props} />;
        case 'haus.widget.visual':
            return <VisualCard html={input.props.html} title={input.props.title} />;
        default:
            return null;
    }
}

function WidgetFallback({ error, text }: { error: string | null; text: string }) {
    return (
        <div
            className={cn(
                'card-shell max-w-[42rem] border border-border bg-surface-secondary/70 px-3 py-2.5',
                'text-sm leading-5'
            )}
            role="note"
        >
            <p
                className="whitespace-pre-wrap break-words text-foreground [overflow-wrap:anywhere]"
                data-selectable-text=""
            >
                {text}
            </p>
            {error ? <p className="mt-1 text-muted text-sm">Widget unavailable.</p> : null}
        </div>
    );
}

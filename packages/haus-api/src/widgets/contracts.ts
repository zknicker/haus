import * as z from 'zod';
import { widgetArtifactPropsSchema } from './artifact/contracts.ts';
import { visualFallbackText, widgetVisualPropsSchema } from './visual/contracts.ts';

// The rendering spec is visuals-only (ADR 0012 → PRD-86 catalog retirement):
// bespoke `visual` fences in chat and the durable page tier (`page` fence) in
// the Workspace pane. The `artifact` widget name and `haus.widget.artifact`
// component id stay as the historical row envelope for that page tier. Retired catalog widgets (tables, charts, calendars, html-preview,
// plugin widgets) no longer parse; their stored activity replays as the
// fallback text card.
export const widgetNameSchema = z.enum(['artifact', 'visual']);

export type WidgetName = z.infer<typeof widgetNameSchema>;

export const widgetTargetSchema = z.enum(['chat.inline']);

export const widgetFallbackSchema = z
    .object({
        text: z.string().trim().min(1).max(500),
    })
    .strict();

export const widgetPropsSchemasByName = {
    artifact: widgetArtifactPropsSchema,
    visual: widgetVisualPropsSchema,
} satisfies Record<WidgetName, z.ZodType>;

export function widgetComponentId<Name extends WidgetName>(name: Name): `haus.widget.${Name}` {
    return `haus.widget.${name}`;
}

const widgetRenderInputEntry = <Name extends WidgetName>(name: Name) =>
    z
        .object({
            component: z.literal(widgetComponentId(name)),
            fallback: widgetFallbackSchema,
            props: widgetPropsSchemasByName[name],
            target: widgetTargetSchema,
        })
        .strict();

export const widgetRenderInputSchema = z.discriminatedUnion('component', [
    widgetRenderInputEntry('artifact'),
    widgetRenderInputEntry('visual'),
]);

export type WidgetRenderInput = z.infer<typeof widgetRenderInputSchema>;
export type WidgetFallback = z.infer<typeof widgetFallbackSchema>;
export type WidgetTarget = z.infer<typeof widgetTargetSchema>;

export interface ParsedWidgetPayload {
    fallbackText: string;
    name: WidgetName;
    render: WidgetRenderInput;
}

/**
 * Validate one fence payload (already JSON-parsed) against the props schema
 * and produce the durable render envelope.
 */
export function parseWidgetPayload(name: string, payload: unknown): ParsedWidgetPayload {
    const parsedName = widgetNameSchema.safeParse(name);
    if (!parsedName.success) {
        throw new Error(`Unknown widget "${name}".`);
    }

    const schema: z.ZodType = widgetPropsSchemasByName[parsedName.data];
    const props = schema.safeParse(payload);
    if (!props.success) {
        const issue = props.error.issues[0];
        const path = issue?.path.join('.') ?? '';
        throw new Error(
            `Invalid ${widgetFenceLabel(parsedName.data)} props${path ? ` at ${path}` : ''}: ${issue?.message ?? 'invalid payload.'}`
        );
    }

    const fallbackText = widgetFallbackText(parsedName.data, props.data);
    const render = widgetRenderInputSchema.parse({
        component: widgetComponentId(parsedName.data),
        fallback: { text: fallbackText },
        props: props.data,
        target: 'chat.inline',
    });

    return { fallbackText, name: parsedName.data, render };
}

export function widgetFallbackText(name: WidgetName, props: unknown): string {
    const record =
        props && typeof props === 'object' && !Array.isArray(props)
            ? (props as Record<string, unknown>)
            : {};
    const title = typeof record.title === 'string' ? record.title.trim() : '';

    if (title) {
        return title.slice(0, 500);
    }

    if (name === 'artifact') {
        const path = typeof record.path === 'string' ? record.path.trim() : '';
        return path ? `Page: ${path}`.slice(0, 500) : 'Page';
    }

    return visualFallbackText(record);
}

/**
 * The fence language an agent writes. The page tier (widget name `artifact`)
 * is a bare `page` fence; the visual tier is a bare `visual` fence (parsed
 * separately — its body is raw HTML, not JSON).
 */
export function widgetFenceLabel(name: WidgetName): 'page' | 'visual' {
    return name === 'artifact' ? 'page' : 'visual';
}

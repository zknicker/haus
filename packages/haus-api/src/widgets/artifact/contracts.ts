import * as z from 'zod';
import { workspaceFilePathSchema } from '../workspace-path.ts';

/**
 * Durable agent page: a self-contained single-file HTML page authored in the
 * agent workspace (inline CSS/JS, no external assets). The chat transcript
 * renders a compact card; opening it renders the page in the Workspace pane's
 * sandboxed HTML preview with the app's theme tokens injected. Authored as a
 * bare `page` fence — see widgetFenceLabel in ../contracts.ts. Path
 * confinement lives in workspace-path.ts.
 */

export const widgetArtifactPropsSchema = z
    .object({
        path: workspaceFilePathSchema(/\.html?$/iu, 'Path must point at an .html or .htm file.'),
        title: z.string().trim().min(1).max(120).optional(),
    })
    .strict();

export type WidgetArtifactProps = z.output<typeof widgetArtifactPropsSchema>;

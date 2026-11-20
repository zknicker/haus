import * as z from 'zod';
import { workspaceFilePathSchema } from '../workspace-path.ts';

/**
 * Durable agent page: a self-contained single-file HTML page the Agent writes
 * to its Drive area (inline CSS/JS, no external assets). The chat transcript
 * renders a compact card; opening it reads the file from Drive and renders it
 * in a sandboxed HTML frame with the app's theme tokens injected. Authored as a
 * bare `page` fence — see widgetFenceLabel in ../contracts.ts. Path
 * confinement lives in workspace-path.ts.
 */

export const widgetArtifactPropsSchema = z
    .object({
        path: workspaceFilePathSchema(/\.html?$/iu, 'Path must point at an .html or .htm file.'),
        /** A Drive revision id: the card opens that version instead of the live file. */
        revision: z.string().trim().min(1).max(128).optional(),
        title: z.string().trim().min(1).max(120).optional(),
    })
    .strict();

export type WidgetArtifactProps = z.output<typeof widgetArtifactPropsSchema>;

import * as z from 'zod';
import { artifactPathSchema } from './artifact-path.ts';
import { artifactMetadataSchema } from './artifacts.ts';

/** The largest file one `haus drive write` sends; it rides the JSON body as base64. */
export const DRIVE_WRITE_MAX_BYTES = 50 * 1024 * 1024;

/**
 * `POST /api/agent/drive/write` (`haus drive write`): a Task writes one deliverable under its own
 * folders (specs/tasks.md#drive). It lands as a new revision attributed to the Task, replacing
 * whatever revision is current. `requestId` makes a retry land once.
 */
export const agentDriveWriteInputSchema = z
    .object({
        contentBase64: z
            .string()
            .max(Math.ceil(DRIVE_WRITE_MAX_BYTES / 3) * 4)
            .regex(/^[A-Za-z0-9+/]*={0,2}$/u, 'Send the file as base64.'),
        contentType: z
            .string()
            .trim()
            .max(255)
            .regex(/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/u)
            .optional(),
        path: artifactPathSchema,
        requestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
    })
    .strict();

export const agentDriveWriteResultSchema = z
    .object({
        artifact: artifactMetadataSchema,
        /** The `drive://` link to paste into a message, which cites this revision once posted. */
        citation: z.string().min(1),
    })
    .strict();

export type AgentDriveWriteInput = z.infer<typeof agentDriveWriteInputSchema>;
export type AgentDriveWriteResult = z.infer<typeof agentDriveWriteResultSchema>;

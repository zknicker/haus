import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/** Every invocation frame stays under this size; larger bytes move as attachment references. */
export const invocationFrameMaxBytes = 1024 * 1024;

export const invocationOperationKindSchema = z.enum([
    'bash',
    'edit',
    'view-image',
    'file-read',
    'file-write',
    'browser',
]);
export type InvocationOperationKind = z.infer<typeof invocationOperationKindSchema>;

export const invocationTimeoutsMs = {
    bash: { default: 120_000, max: 600_000 },
    browser: { default: 60_000, max: 60_000 },
    edit: { default: 30_000, max: 30_000 },
    'file-read': { default: 60_000, max: 60_000 },
    'file-write': { default: 60_000, max: 60_000 },
    'view-image': { default: 30_000, max: 30_000 },
} as const satisfies Record<InvocationOperationKind, { default: number; max: number }>;

/** Past its timeout plus this grace, the runner and the Server both settle an invocation `unknown`. */
export const invocationGraceMs = 30_000;

/** The runner waits this much past the Server's window, so the Server decides `unknown` first. */
export const invocationRunnerMarginMs = 5000;

/** Bytes that would push a frame past the limit, streamed through the attachment upload. */
export const invocationPayloadReferenceSchema = z
    .object({
        attachmentId: idSchema,
        kind: z.literal('attachment'),
        mediaType: z.string().trim().min(1).max(255),
        sha256: z.string().regex(/^[0-9a-f]{64}$/u),
        sizeBytes: z.number().int().positive(),
    })
    .strict();
export type InvocationPayloadReference = z.infer<typeof invocationPayloadReferenceSchema>;

export const invocationInlineBytesSchema = z
    .object({
        base64: z.base64(),
        kind: z.literal('inline'),
        mediaType: z.string().trim().min(1).max(255),
    })
    .strict();
export type InvocationInlineBytes = z.infer<typeof invocationInlineBytesSchema>;

export const invocationBytesSchema = z.discriminatedUnion('kind', [
    invocationInlineBytesSchema,
    invocationPayloadReferenceSchema,
]);
export type InvocationBytes = z.infer<typeof invocationBytesSchema>;

const machinePathSchema = z.string().trim().min(1).max(4096);

/** Anthropic's text editor input, kept in the shape Claude models are trained on. */
export const editorCommandSchema = z.discriminatedUnion('command', [
    z
        .object({
            command: z.literal('view'),
            path: machinePathSchema,
            view_range: z.tuple([z.number().int().min(1), z.number().int().min(-1)]).optional(),
        })
        .strict(),
    z
        .object({
            command: z.literal('create'),
            file_text: z.string(),
            path: machinePathSchema,
        })
        .strict(),
    z
        .object({
            command: z.literal('str_replace'),
            new_str: z.string(),
            old_str: z.string().min(1),
            path: machinePathSchema,
        })
        .strict(),
    z
        .object({
            command: z.literal('insert'),
            insert_line: z.number().int().min(0),
            new_str: z.string(),
            path: machinePathSchema,
        })
        .strict(),
]);
export type EditorCommand = z.infer<typeof editorCommandSchema>;

/** One patch in OpenAI Codex's `apply_patch` grammar, the shape GPT models are trained on. */
export const patchCommandSchema = z
    .object({
        command: z.literal('apply_patch'),
        cwd: machinePathSchema.optional(),
        input: z.string().min(1).max(262_144),
    })
    .strict();
export type PatchCommand = z.infer<typeof patchCommandSchema>;

export const invocationEditSchema = z.discriminatedUnion('command', [
    ...editorCommandSchema.options,
    patchCommandSchema,
]);
export type InvocationEdit = z.infer<typeof invocationEditSchema>;

export const invocationOperationSchema = z.discriminatedUnion('kind', [
    z
        .object({
            command: z.string().min(1).max(262_144),
            cwd: machinePathSchema.optional(),
            kind: z.literal('bash'),
        })
        .strict(),
    z.object({ edit: invocationEditSchema, kind: z.literal('edit') }).strict(),
    z.object({ kind: z.literal('view-image'), path: machinePathSchema }).strict(),
    z
        .object({
            kind: z.literal('file-read'),
            maxBytes: z.number().int().positive(),
            path: machinePathSchema,
        })
        .strict(),
    z
        .object({
            bytes: invocationBytesSchema,
            kind: z.literal('file-write'),
            mode: z.number().int().min(0).max(0o777),
            path: machinePathSchema,
        })
        .strict(),
    z
        .object({
            args: z.array(z.string().max(32_768)).min(1).max(100),
            kind: z.literal('browser'),
        })
        .strict(),
]);
export type InvocationOperation = z.infer<typeof invocationOperationSchema>;

/** Outcomes a machine reports. `offline` is never one: the Server answers it without sending `invoke`. */
export const machineInvocationOutcomeSchema = z.enum([
    'completed',
    'failed',
    'timed-out',
    'cancelled',
    'unknown',
]);
export type MachineInvocationOutcome = z.infer<typeof machineInvocationOutcomeSchema>;

export const invocationOutcomeSchema = z.enum([
    ...machineInvocationOutcomeSchema.options,
    'offline',
]);
export type InvocationOutcome = z.infer<typeof invocationOutcomeSchema>;

export const invocationOutcomeNotices = {
    offline: 'The machine is offline. Nothing ran. `haus` and `execute` still work.',
    unknown:
        'The machine lost this command before it reported a result. It may or may not have run; check its effects before running it again.',
} as const satisfies Partial<Record<InvocationOutcome, string>>;

export const invocationOutputSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text'), text: z.string() }).strict(),
    invocationInlineBytesSchema,
    invocationPayloadReferenceSchema,
]);
export type InvocationOutput = z.infer<typeof invocationOutputSchema>;

export const invokeCommandSchema = z
    .object({
        agentId: idSchema,
        invocationId: idSchema,
        operation: invocationOperationSchema,
        runId: idSchema,
        timeoutMs: z.number().int().positive().max(invocationTimeoutsMs.bash.max),
        type: z.literal('invoke'),
    })
    .strict();
export type InvokeCommand = z.infer<typeof invokeCommandSchema>;

export const invokeCancelCommandSchema = z
    .object({ invocationId: idSchema, type: z.literal('invoke-cancel') })
    .strict();
export type InvokeCancelCommand = z.infer<typeof invokeCancelCommandSchema>;

export const invokeResultAckSchema = z
    .object({ invocationId: idSchema, type: z.literal('invoke-result-ack') })
    .strict();
export type InvokeResultAck = z.infer<typeof invokeResultAckSchema>;

export const invocationCommandSchemas = [
    invokeCommandSchema,
    invokeCancelCommandSchema,
    invokeResultAckSchema,
] as const;

export const invokeAcceptedSchema = z
    .object({ invocationId: idSchema, type: z.literal('invoke-accepted') })
    .strict();
export type InvokeAccepted = z.infer<typeof invokeAcceptedSchema>;

export const invokeResultSchema = z
    .object({
        exitCode: z.number().int().optional(),
        invocationId: idSchema,
        logPath: z.string().min(1).max(4096).optional(),
        outcome: machineInvocationOutcomeSchema,
        output: invocationOutputSchema,
        truncated: z.boolean(),
        type: z.literal('invoke-result'),
    })
    .strict();
export type InvokeResult = z.infer<typeof invokeResultSchema>;

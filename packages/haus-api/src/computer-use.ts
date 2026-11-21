import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

/**
 * A Device's **Computer use** setting (specs/computer-use.md). `ask` asks each
 * chat once before a Captain clicks or types there; `always` never asks.
 * Looking at the screen never asks under either.
 */
export const computerUseAccessSchema = z.enum(['ask', 'always']);
export type ComputerUseAccess = z.infer<typeof computerUseAccessSchema>;

/** `computer.setComputerUse`: stewards only. Publishes `computer.updated`. */
export const computerSetComputerUseInputSchema = z
    .object({ access: computerUseAccessSchema, computerId: idSchema, serverId: idSchema })
    .strict();
export type ComputerSetComputerUseInput = z.infer<typeof computerSetComputerUseInputSchema>;

/** The setting as `computer.list` shows it, with whether the viewer may change it. */
export const computerUseSettingsSchema = z
    .object({ canChangeComputerUse: z.boolean(), computerUseAccess: computerUseAccessSchema })
    .strict();
export type ComputerUseSettings = z.infer<typeof computerUseSettingsSchema>;

const lookCommands = [
    'snapshot',
    'find',
    'get',
    'is',
    'screenshot',
    'list-surfaces',
    'list-apps',
    'list-windows',
    'list-displays',
    'list-notifications',
    'wait',
    'status',
    'version',
    'skills',
] as const;

const actCommands = [
    'click',
    'double-click',
    'triple-click',
    'right-click',
    'type',
    'set-value',
    'clear',
    'focus',
    'select',
    'toggle',
    'check',
    'uncheck',
    'expand',
    'collapse',
    'scroll',
    'scroll-to',
    'press',
    'hover',
    'drag',
    'mouse-move',
    'mouse-click',
    'mouse-wheel',
    'launch',
    'close-app',
    'focus-window',
    'resize-window',
    'move-window',
    'minimize',
    'maximize',
    'restore',
    'open-system-surface',
    'dismiss-notification',
    'dismiss-all-notifications',
    'notification-action',
    'clipboard-get',
    'clipboard-set',
    'clipboard-clear',
] as const;

const refusedFlags = new Set(['--session', '--agent-id', '--multi-agent', '--stdin']);

export type DesktopCommandClass = 'look' | 'act' | 'refused';

/**
 * Classifies one agent-desktop command by its first argument. The Server gates
 * `act` by the Device's setting and the chat's approval; the Computer runs
 * only `look` and `act`.
 */
export function desktopCommandClass(args: readonly string[]) {
    const [command, ...rest] = args;
    const flags = rest.filter((arg) => arg.startsWith('--')).map((arg) => arg.split('=')[0]);
    if (flags.some((flag) => refusedFlags.has(flag ?? '') || flag?.startsWith('--trace'))) {
        return classOf('refused');
    }
    if (isOneOf(lookCommands, command)) {
        return flags.includes('--headed') ? classOf('refused') : classOf('look');
    }
    return isOneOf(actCommands, command) ? classOf('act') : classOf('refused');
}

export const computerUseRequestStateSchema = z.enum(['requested', 'allowed', 'denied']);
export type ComputerUseRequestState = z.infer<typeof computerUseRequestStateSchema>;

export const computerUseDecisionSchema = z.enum(['allow', 'always', 'deny']);
export type ComputerUseDecision = z.infer<typeof computerUseDecisionSchema>;

/** One Permission request, as `computerUse.requests` returns it. */
export const computerUseRequestSchema = z
    .object({
        agentId: idSchema,
        canDecide: z.boolean(),
        chatId: idSchema,
        command: z.string().min(1).max(64),
        computerId: idSchema,
        computerName: z.string().min(1).max(100).nullable(),
        decidedAt: timestampSchema.nullable(),
        decidedByName: z.string().min(1).max(200).nullable(),
        detail: z.string().max(200),
        id: idSchema,
        requestedAt: timestampSchema,
        standing: z.boolean(),
        state: computerUseRequestStateSchema,
        waitingForName: z.string().min(1).max(200).nullable(),
    })
    .strict();
export type ComputerUseRequest = z.infer<typeof computerUseRequestSchema>;

export const computerUseRequestsInputSchema = z
    .object({ chatId: idSchema, serverId: idSchema })
    .strict();
export type ComputerUseRequestsInput = z.infer<typeof computerUseRequestsInputSchema>;

export const computerUseRequestsSchema = z
    .object({ requests: z.array(computerUseRequestSchema) })
    .strict();
export type ComputerUseRequests = z.infer<typeof computerUseRequestsSchema>;

/** `computerUse.decide`: a steward of the request's Computer answers it once. */
export const computerUseDecideInputSchema = z
    .object({ decision: computerUseDecisionSchema, requestId: idSchema, serverId: idSchema })
    .strict();
export type ComputerUseDecideInput = z.infer<typeof computerUseDecideInputSchema>;

/** Announced when a request in the chat is created or decided; the App refetches. */
export const computerUseRequestUpdatedEventSchema = z
    .object({
        chatId: idSchema,
        emittedAt: timestampSchema,
        requestId: idSchema,
        serverId: idSchema,
        type: z.literal('computerUse.requestUpdated'),
    })
    .strict();
export type ComputerUseRequestUpdatedEvent = z.infer<typeof computerUseRequestUpdatedEventSchema>;

export const computerUsePermissionStateSchema = z.enum(['granted', 'denied', 'unknown']);
export type ComputerUsePermissionState = z.infer<typeof computerUsePermissionStateSchema>;

/** What a macOS Computer reports about agent-desktop and the permissions it needs. */
export const computerUseReadinessSchema = z
    .object({
        accessibility: computerUsePermissionStateSchema,
        installed: z.boolean(),
        screenRecording: computerUsePermissionStateSchema,
        version: z.string().trim().min(1).max(64).nullable(),
    })
    .strict();
export type ComputerUseReadiness = z.infer<typeof computerUseReadinessSchema>;

/** The inbox source of a decision, delivered to the requesting Agent in the request's chat. */
export const computerUseInboxSource = 'computer_use';

function classOf(value: DesktopCommandClass) {
    return value;
}

function isOneOf<T extends string>(values: readonly T[], value: string | undefined): value is T {
    return value !== undefined && (values as readonly string[]).includes(value);
}

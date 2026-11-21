import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * `computer.setComputerUse` turns a Device's **Computer use allowed** switch
 * (specs/computer-use.md) on or off. Stewards only. Publishes `computer.updated`.
 */
export const computerSetComputerUseInputSchema = z
    .object({ computerId: idSchema, enabled: z.boolean(), serverId: idSchema })
    .strict();
export type ComputerSetComputerUseInput = z.infer<typeof computerSetComputerUseInputSchema>;

/**
 * Which Captains may use computer use on a Device. `all` covers every Agent
 * whose machine is the Device, including ones added later. `named` lists
 * Agents by id; an entry is dropped when its Agent is deleted or moves to
 * another machine, so a stored list can end up empty, which allows nobody.
 */
export const computerUseAgentsSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all') }).strict(),
    z.object({ agentIds: z.array(idSchema).max(200), kind: z.literal('named') }).strict(),
]);
export type ComputerUseAgents = z.infer<typeof computerUseAgentsSchema>;

/** A person names at least one Captain; an empty list is only ever the result of removals. */
export const computerUseAgentsInputSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all') }).strict(),
    z.object({ agentIds: z.array(idSchema).min(1).max(200), kind: z.literal('named') }).strict(),
]);

/**
 * `computer.setComputerUseAgents` changes which Captains may use computer use
 * on a Device. Stewards only. Publishes `computer.updated`.
 */
export const computerSetComputerUseAgentsInputSchema = z
    .object({ agents: computerUseAgentsInputSchema, computerId: idSchema, serverId: idSchema })
    .strict();
export type ComputerSetComputerUseAgentsInput = z.infer<
    typeof computerSetComputerUseAgentsInputSchema
>;

/**
 * The computer-use settings as `computer.list` shows them, with whether the
 * viewer may change them. `computerUseChangedAt` is when the switch last
 * changed, null while it has never been turned on.
 */
export interface ComputerUseSettings {
    canChangeComputerUse: boolean;
    computerUseAgents: ComputerUseAgents;
    computerUseChangedAt: Date | null;
    computerUseEnabled: boolean;
}

/** Device-page reads and actions take the Device and its Server. */
export const computerUseDeviceInputSchema = z
    .object({ computerId: idSchema, serverId: idSchema })
    .strict();
export type ComputerUseDeviceInput = z.infer<typeof computerUseDeviceInputSchema>;

/**
 * `computer.desktopActivity`: the Captains with a `desktop` command open on a
 * Device right now, oldest first. Volatile; `computer.onDesktopActivity`
 * says when it changed.
 */
export const desktopActivitySchema = z
    .object({
        commands: z.array(
            z.object({ agentId: idSchema, invocationId: idSchema, since: z.date() }).strict()
        ),
    })
    .strict();
export type DesktopActivity = z.infer<typeof desktopActivitySchema>;

/** `computer.onDesktopActivity` payload: the Device whose desktop activity changed. */
export const desktopActivityEventSchema = z.object({ computerId: idSchema }).strict();
export type DesktopActivityEvent = z.infer<typeof desktopActivityEventSchema>;

/**
 * `computer.stewards`: who may change a Device's settings, readable by every
 * member so a refusal's link works for someone who cannot open the Device.
 */
export const computerStewardsSchema = z
    .object({
        attacher: z.object({ displayName: z.string(), handle: z.string().nullable() }).strict(),
        name: z.string().nullable(),
    })
    .strict();
export type ComputerStewards = z.infer<typeof computerStewardsSchema>;

/**
 * Why a `desktop` command was refused. The Server refuses `off`, `not-listed`,
 * `not-mac`, `offline`, and `not-ready` before sending anything; the Computer
 * reports `locked`, `no-session`, and `switched-out` from its screen preflight.
 */
export const desktopRefusalSchema = z.enum([
    'off',
    'not-listed',
    'not-mac',
    'offline',
    'not-ready',
    'locked',
    'no-session',
    'switched-out',
]);
export type DesktopRefusal = z.infer<typeof desktopRefusalSchema>;

/** The refusals a Computer's screen preflight reports in an `invoke-result`. */
export const screenRefusalSchema = desktopRefusalSchema.extract([
    'locked',
    'no-session',
    'switched-out',
]);
export type ScreenRefusal = z.infer<typeof screenRefusalSchema>;

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
 * Classifies one agent-desktop command by its first argument. The Computer
 * runs only `look` and `act`.
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

export const computerUsePermissionStateSchema = z.enum(['granted', 'denied', 'unknown']);
export type ComputerUsePermissionState = z.infer<typeof computerUsePermissionStateSchema>;

/**
 * What a macOS Computer reports about agent-desktop and the permissions it needs.
 * `permissionsMoved` is true while an update has moved the permissions to a new
 * holder (the bare executable became `Haus Computer.app`) and they are not granted
 * again yet. Unknown keys are dropped so a newer Computer never invalidates the
 * inventory an older Server reads.
 */
export const computerUseReadinessSchema = z.object({
    accessibility: computerUsePermissionStateSchema,
    /** The `.app` macOS charges the permissions to, for the Device page's Copy path. */
    appPath: z.string().trim().min(1).max(1024).optional(),
    installed: z.boolean(),
    /** `sw_vers -productVersion`, which picks the pane names and steps the Device page shows. */
    macosVersion: z
        .string()
        .regex(/^\d{1,3}(\.\d{1,3}){0,2}$/u)
        .optional(),
    permissionsMoved: z.boolean().optional(),
    screenRecording: computerUsePermissionStateSchema,
    version: z.string().trim().min(1).max(64).nullable(),
});
export type ComputerUseReadiness = z.infer<typeof computerUseReadinessSchema>;

function classOf(value: DesktopCommandClass) {
    return value;
}

function isOneOf<T extends string>(values: readonly T[], value: string | undefined): value is T {
    return value !== undefined && (values as readonly string[]).includes(value);
}

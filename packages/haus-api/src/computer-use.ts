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

/** The switch as `computer.list` shows it, with whether the viewer may change it. */
export const computerUseSettingsSchema = z
    .object({ canChangeComputerUse: z.boolean(), computerUseEnabled: z.boolean() })
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
    installed: z.boolean(),
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

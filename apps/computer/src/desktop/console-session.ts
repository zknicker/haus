import type { ScreenRefusal } from '@haus/api';
import * as z from 'zod';
import { parsePlist } from './plist.ts';

const consoleRootSchema = z.object({
    IOConsoleLocked: z.boolean().optional(),
    IOConsoleUsers: z
        .array(
            z.object({
                CGSSessionScreenIsLocked: z.boolean().optional(),
                kCGSSessionOnConsoleKey: z.boolean().optional(),
                kCGSSessionUserIDKey: z.number().int().optional(),
                kCGSessionLoginDoneKey: z.boolean().optional(),
            })
        )
        .optional(),
});

export function consoleRefusal(ioregPlist: string, uid: number) {
    const root = consoleRootSchema.parse(parsePlist(ioregPlist));
    const onConsole = (root.IOConsoleUsers ?? []).find(
        (session) => session.kCGSSessionOnConsoleKey && session.kCGSessionLoginDoneKey
    );
    if (!onConsole) {
        return refusal('no-session');
    }
    if (onConsole.kCGSSessionUserIDKey !== uid) {
        return refusal('switched-out');
    }
    if (onConsole.CGSSessionScreenIsLocked || root.IOConsoleLocked) {
        return refusal('locked');
    }
    return null;
}

function refusal(value: ScreenRefusal) {
    return value;
}

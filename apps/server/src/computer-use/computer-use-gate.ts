import type { DesktopRefusal } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    type DesktopRefusalSubject,
    desktopGateCause,
    desktopRefusalFacts,
    readDesktopDevice,
    readDesktopDeviceName,
} from './desktop-device.ts';
import { desktopRefusalText } from './desktop-refusal-text.ts';

export async function desktopGateRefusal(
    db: HausDatabase,
    input: { agentId: string; computerId: string; online: boolean; serverId: string }
) {
    const device = await readDesktopDevice(db, input);
    return device ? desktopGateCause(device, input.online) : ('not-found' as const);
}

export async function renderDesktopRefusal(
    db: HausDatabase,
    input: { appOrigin: string; cause: DesktopRefusal; subject: DesktopRefusalSubject }
) {
    const device = await readDesktopDevice(db, input.subject);
    if (!device) {
        return null;
    }
    const facts = await desktopRefusalFacts(
        db,
        { appOrigin: input.appOrigin, cause: input.cause, device },
        input.subject
    );
    return desktopRefusalText(facts);
}

export async function desktopStoppedText(
    db: HausDatabase,
    record: { computerId: string | null; serverId: string }
) {
    const device = await readDesktopDeviceName(db, record);
    return `A person stopped agent input on ${device} from Haus, so this command was cancelled. Stop using \`desktop\` there and tell the person what you were doing.`;
}

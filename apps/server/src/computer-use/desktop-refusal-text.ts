import { computerUsePanes, type DesktopRefusal } from '@haus/api';

export interface DesktopRefusalFacts {
    agentName: string;
    attacherHandle: string | null;
    cause: DesktopRefusal;
    changedAt: Date | null;
    device: string;
    history: { lastRefusedAt: Date | null; refusedThisTurn: boolean };
    link: string;
    readiness: { macosVersion: string | undefined; missing: DesktopReadinessGap[] };
}

export type DesktopReadinessGap = 'accessibility' | 'install' | 'screen-recording';

const settingCauses = new Set<DesktopRefusal>(['not-listed', 'off']);

export function desktopRefusalText(facts: DesktopRefusalFacts) {
    const reason = reasonText(facts);
    if (facts.history.refusedThisTurn) {
        return `${reason} Already refused this turn. Stop calling \`desktop\`.`;
    }
    if (facts.history.lastRefusedAt) {
        return `${reason} You were already refused for this on ${facts.device} at ${timeText(facts.history.lastRefusedAt)} and asked then. Don't ask again; wait for a reply.`;
    }
    const done = settingCauses.has(facts.cause) ? 'it’s changed' : 'it’s done';
    return `${reason} Ask once in plain text where you're working, link that page, and ask them to reply when ${done}. Then stop. When they reply, try again.`;
}

function reasonText(facts: DesktopRefusalFacts) {
    const { device, link } = facts;
    const page = `Settings → Devices → ${device} (${link})`;
    const steward = facts.attacherHandle
        ? `@${facts.attacherHandle}, or an Owner or Admin,`
        : `The person who attached ${device}, or an Owner or Admin,`;
    const person = facts.attacherHandle
        ? `@${facts.attacherHandle}`
        : `the person who attached ${device}`;
    switch (facts.cause) {
        case 'off':
            return `Computer use is off on ${device}${facts.changedAt ? ` (since ${dateText(facts.changedAt)})` : ' and has never been turned on'}. ${steward} can turn it on in ${page}.`;
        case 'not-listed':
            return `Computer use on ${device} isn't allowed for ${facts.agentName}. ${steward} can add ${facts.agentName} in ${page}.`;
        case 'not-mac':
            return `Computer use runs on macOS Devices, and ${device} isn't a Mac.`;
        case 'offline':
            return `${device} is offline, so computer use can't run there. Ask ${person} to wake that Mac and check that Haus Computer is running; ${page} shows when it's back.`;
        case 'not-ready':
            return notReadyText(facts, person, page);
        case 'locked':
            return `${device}'s screen is locked; no computer use runs on a locked Mac. Ask ${person} to unlock it.`;
        case 'no-session':
            return `Nobody is logged in to ${device}'s screen, so computer use can't run. Ask ${person} to log in on that Mac.`;
        case 'switched-out':
            return `Another macOS user is using ${device}'s screen, so computer use can't run. Ask ${person} to switch back to their account on that Mac.`;
    }
}

function notReadyText(facts: DesktopRefusalFacts, person: string, page: string) {
    const { missing } = facts.readiness;
    if (missing.includes('install')) {
        return `Haus Computer on ${facts.device} couldn't set up computer use. Ask ${person} to update Haus Computer from ${page}.`;
    }
    const panes = computerUsePanes(facts.readiness.macosVersion);
    const names = missing.map((gap) =>
        gap === 'accessibility' ? panes.accessibility : panes.screenRecording
    );
    return `macOS hasn't given Haus Computer ${names.join(' and ')} on ${facts.device} yet. ${person.charAt(0).toUpperCase()}${person.slice(1)} can allow it in System Settings → Privacy & Security on that Mac; the steps are in ${page}.`;
}

function dateText(at: Date) {
    return at.toISOString().slice(0, 10);
}

function timeText(at: Date) {
    return `${at.toISOString().slice(11, 16)} UTC on ${dateText(at)}`;
}

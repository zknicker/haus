import { createHash } from 'node:crypto';
import { daytimeHeartbeatSlots, nightlyHeartbeatSlot } from '@haus/api';

/**
 * Daytime slots start every three hours, 08:00 through 20:00, in this machine's local
 * time; the slot list is the wire contract's, so the two cannot drift.
 */
export const daytimeSlotSpanMs = 3 * 60 * 60 * 1000;
/** The nightly window, in local time: the night's run is requested from 03:00 until 05:00. */
export const nightlyWindow = { endHour: 5, startHour: 3 } as const;
export const nightlySlot = nightlyHeartbeatSlot;

export type HeartbeatKind = 'daytime' | 'nightly';

/** One due slot for one Agent: the Server dedupes on `kind`, `localDate`, and `slot`. */
export type HeartbeatSlot =
    | { kind: 'daytime'; localDate: string; slot: (typeof daytimeHeartbeatSlots)[number] }
    | { kind: 'nightly'; localDate: string; slot: typeof nightlyHeartbeatSlot };

/** A stable per-Agent minute in [0, 60), so Agents do not all run on the hour. */
export function agentSlotOffsetMinutes(agentId: string): number {
    return createHash('sha256').update(agentId).digest().readUInt32BE(0) % 60;
}

/**
 * The slot this Agent owes at `now`, or null. A daytime slot is due from its start plus
 * the Agent's offset until the next slot begins; a slot that passed is never made up.
 * The nightly slot is due anywhere inside the nightly window.
 */
export function dueHeartbeatSlot(agentId: string, now: Date): HeartbeatSlot | null {
    const localDate = localDateOf(now);
    if (now.getHours() >= nightlyWindow.startHour && now.getHours() < nightlyWindow.endHour) {
        return { kind: 'nightly', localDate, slot: nightlySlot };
    }
    const offsetMs = agentSlotOffsetMinutes(agentId) * 60_000;
    for (const slot of daytimeHeartbeatSlots) {
        const hour = Number(slot.slice(0, 2));
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour).getTime();
        if (now.getTime() >= start + offsetMs && now.getTime() < start + daytimeSlotSpanMs) {
            return { kind: 'daytime', localDate, slot };
        }
    }
    return null;
}

/** The identity of a slot, for "already sent" checks. */
export function slotKey(slot: HeartbeatSlot): string {
    return `${slot.kind}:${slot.localDate}:${slot.slot}`;
}

/** The machine-local calendar date, the Server's dedupe key. */
export function localDateOf(now: Date): string {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

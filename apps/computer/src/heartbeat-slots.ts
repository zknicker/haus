import { createHash } from 'node:crypto';

/** Daytime slots start every two hours, 08:00 through 22:00, in this machine's local time. */
export const daytimeSlotHours = [8, 10, 12, 14, 16, 18, 20, 22] as const;
export const daytimeSlotSpanMs = 2 * 60 * 60 * 1000;
/** The nightly window, in local time: the night's run is requested from 03:00 until 05:00. */
export const nightlyWindow = { endHour: 5, startHour: 3 } as const;
export const nightlySlot = '03:00';

export type HeartbeatKind = 'daytime' | 'nightly';

/** One due slot for one Agent: the Server dedupes on `kind`, `localDate`, and `slot`. */
export interface HeartbeatSlot {
    kind: HeartbeatKind;
    localDate: string;
    slot: string;
}

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
    for (const hour of daytimeSlotHours) {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour).getTime();
        if (now.getTime() >= start + offsetMs && now.getTime() < start + daytimeSlotSpanMs) {
            return { kind: 'daytime', localDate, slot: `${String(hour).padStart(2, '0')}:00` };
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

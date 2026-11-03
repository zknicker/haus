import { heartbeatCheckOutcomes, heartbeatKinds, heartbeatSkipReasons } from '@haus/effect';

const kinds = new Set<string>(heartbeatKinds);
const outcomes = new Set<string>(heartbeatCheckOutcomes);
const skipReasons = new Set<string>(heartbeatSkipReasons);
const localDate = /^\d{4}-\d{2}-\d{2}$/u;
const slotTime = /^([01]\d|2[0-3]):[0-5]\d$/u;

/**
 * Whether a relayed `haus.heartbeat.*` attribute value is inside its closed vocabulary.
 * Any other key is not a heartbeat attribute, so it is refused.
 */
export function isRelayableHeartbeatAttribute(key: string, value: string): boolean {
    switch (key) {
        case 'haus.heartbeat.kind':
            return kinds.has(value);
        case 'haus.heartbeat.local_date':
            return localDate.test(value);
        case 'haus.heartbeat.outcome':
            return outcomes.has(value);
        case 'haus.heartbeat.skip_reason':
            return skipReasons.has(value);
        case 'haus.heartbeat.slot':
            return slotTime.test(value);
        default:
            return false;
    }
}

import type { HausDatabase } from '../postgres/connection.ts';
import { deletePushDevice, listPushDevices, recordPushDeviceError } from './push-devices.ts';
import type { PushRequest, PushSender } from './push-sender.ts';

/**
 * Sends one alert to every device a human registered, forgetting tokens the push
 * service says are gone and recording its other refusals on the device.
 */
export async function sendToDevices(
    db: HausDatabase,
    sender: PushSender,
    userId: string,
    request: Pick<PushRequest, 'collapseId' | 'payload'>
): Promise<void> {
    for (const device of await listPushDevices(db, userId)) {
        const outcome = await sender.send({ ...request, device });
        if (outcome.kind === 'device-gone') {
            await deletePushDevice(db, device.token);
        } else if (outcome.kind === 'rejected') {
            console.warn(
                `[haus] APNs refused a push to device …${device.token.slice(-6)}: ${outcome.status ?? 'no status'} ${outcome.reason}`
            );
            await recordPushDeviceError(
                db,
                device.token,
                `${outcome.status ?? 'transport'} ${outcome.reason}`
            );
        }
    }
}

import type { PushEnvironment, PushNotificationPayload } from '@haus/api';

/** Where one push goes: a registered device and the app topic it listens on. */
export interface PushDevice {
    bundleId: string;
    environment: PushEnvironment;
    token: string;
}

export interface PushRequest {
    /** Replaces an undelivered push with the same id on the device. */
    collapseId: string;
    device: PushDevice;
    payload: PushNotificationPayload;
}

/**
 * What the push service said about one request. `device-gone` means the token
 * will never work again and its registration should go; `rejected` is any
 * other refusal or transport failure, recorded and not retried.
 */
export type PushOutcome =
    | { kind: 'delivered' }
    | { kind: 'device-gone'; reason: string }
    | { kind: 'rejected'; reason: string; status: number | null };

/**
 * The push-service boundary. Implementations never throw from `send`: every
 * failure is an outcome, so a push can never break the send path that caused it.
 */
export interface PushSender {
    close(): Promise<void>;
    send(request: PushRequest): Promise<PushOutcome>;
}

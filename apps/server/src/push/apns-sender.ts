import http2 from 'node:http2';
import type { PushEnvironment } from '@haus/api';
import { type ApnsCredentials, ApnsProviderToken } from './apns-provider-token.ts';
import type { PushOutcome, PushRequest, PushSender } from './push-sender.ts';

const apnsOrigins = {
    production: 'https://api.push.apple.com',
    sandbox: 'https://api.sandbox.push.apple.com',
} satisfies Record<PushEnvironment, string>;

/** APNs reasons that mean the token will never be delivered to again. */
const goneReasons = new Set(['BadDeviceToken', 'Unregistered']);

export interface ApnsSenderOptions {
    /** Test seam for the provider token clock. */
    now?: () => number;
    /** Test seam: a local HTTP/2 APNs stand-in. */
    origins?: Record<PushEnvironment, string>;
    /** How often an open session is pinged; an unanswered ping by the next one drops it. */
    pingIntervalMs?: number;
    requestTimeoutMs?: number;
}

interface ApnsResponse {
    reason: string | null;
    status: number;
}

/**
 * Token-based APNs over HTTP/2: one long-lived session per environment,
 * reopened after it closes, errors, times out a request, or misses a ping.
 * Each request is sent once; throttling and 5xx answers are reported, never
 * retried, so a burst cannot become a storm.
 */
export class ApnsSender implements PushSender {
    private readonly sessions = new Map<PushEnvironment, http2.ClientHttp2Session>();
    /** Set when APNs refuses the key itself: config is wrong until restart. */
    private disabledReason: string | null = null;

    private constructor(
        private readonly providerToken: ApnsProviderToken,
        private readonly options: Required<Omit<ApnsSenderOptions, 'now'>>
    ) {}

    static async create(
        credentials: ApnsCredentials,
        options: ApnsSenderOptions = {}
    ): Promise<ApnsSender> {
        return new ApnsSender(await ApnsProviderToken.create(credentials, options.now), {
            origins: options.origins ?? apnsOrigins,
            pingIntervalMs: options.pingIntervalMs ?? 60_000,
            requestTimeoutMs: options.requestTimeoutMs ?? 10_000,
        });
    }

    async send(request: PushRequest): Promise<PushOutcome> {
        if (this.disabledReason) {
            return { kind: 'rejected', reason: this.disabledReason, status: null };
        }
        try {
            const response = await this.post(request, await this.providerToken.current());
            return this.outcomeOf(response);
        } catch (cause) {
            return {
                kind: 'rejected',
                reason: cause instanceof Error ? cause.message : 'APNs request failed',
                status: null,
            };
        }
    }

    close(): Promise<void> {
        const closing = [...this.sessions.values()].map(
            (session) => new Promise<void>((resolve) => session.close(() => resolve()))
        );
        this.sessions.clear();
        return Promise.all(closing).then(() => undefined);
    }

    private outcomeOf(response: ApnsResponse): PushOutcome {
        if (response.status === 200) {
            return { kind: 'delivered' };
        }
        const reason = response.reason ?? `HTTP ${response.status}`;
        if (response.status === 410 || (response.status === 400 && goneReasons.has(reason))) {
            return { kind: 'device-gone', reason };
        }
        if (response.status === 403 && reason === 'ExpiredProviderToken') {
            this.providerToken.invalidate();
        }
        if (response.status === 403 && reason === 'InvalidProviderToken') {
            this.disabledReason = 'InvalidProviderToken: iPhone push disabled until restart';
            console.error(
                '[haus] APNs refused the provider token (InvalidProviderToken); check HAUS_APNS_KEY_ID, HAUS_APNS_PRIVATE_KEY, and APPLE_TEAM_ID. iPhone push is disabled until restart.'
            );
        }
        return { kind: 'rejected', reason, status: response.status };
    }

    private post(request: PushRequest, providerToken: string): Promise<ApnsResponse> {
        const environment = request.device.environment;
        const session = this.session(environment);
        const body = JSON.stringify(request.payload);
        return new Promise((resolve, reject) => {
            let settled = false;
            const settle = (finish: () => void) => {
                if (!settled) {
                    settled = true;
                    finish();
                }
            };
            const stream = session.request({
                ':method': 'POST',
                ':path': `/3/device/${request.device.token}`,
                'apns-collapse-id': request.collapseId,
                'apns-priority': '10',
                'apns-push-type': 'alert',
                'apns-topic': request.device.bundleId,
                authorization: `bearer ${providerToken}`,
                'content-length': Buffer.byteLength(body),
                'content-type': 'application/json',
            });
            let status = 0;
            let responseBody = '';
            stream.setEncoding('utf8');
            stream.setTimeout(this.options.requestTimeoutMs, () => {
                settle(() => reject(new Error('APNs request timed out')));
                // A silent session fails every later push the same way; drop it so the next send reconnects.
                this.discard(environment, session);
            });
            stream.on('response', (headers) => {
                status = Number(headers[':status'] ?? 0);
            });
            stream.on('data', (chunk: string) => {
                responseBody += chunk;
            });
            stream.on('end', () =>
                settle(() => resolve({ reason: readReason(responseBody), status }))
            );
            stream.on('error', (error) => settle(() => reject(error)));
            stream.on('close', () =>
                settle(() => reject(new Error('APNs stream closed without a response')))
            );
            stream.end(body);
        });
    }

    private session(environment: PushEnvironment): http2.ClientHttp2Session {
        const existing = this.sessions.get(environment);
        if (existing && !(existing.closed || existing.destroyed)) {
            return existing;
        }
        const session = http2.connect(this.options.origins[environment]);
        const forget = () => {
            if (this.sessions.get(environment) === session) {
                this.sessions.delete(environment);
            }
        };
        // A session error fails its in-flight streams; the next send reconnects.
        session.on('error', forget);
        session.on('close', forget);
        session.on('goaway', forget);
        const pinger = setInterval(
            () => this.ping(environment, session),
            this.options.pingIntervalMs
        );
        pinger.unref();
        session.on('close', () => clearInterval(pinger));
        session.unref();
        this.sessions.set(environment, session);
        return session;
    }

    /** A ping unanswered before the next one is due means the connection is dead. */
    private ping(environment: PushEnvironment, session: http2.ClientHttp2Session) {
        const deadline = setTimeout(
            () => this.discard(environment, session),
            this.options.pingIntervalMs
        );
        deadline.unref();
        try {
            session.ping((error) => {
                clearTimeout(deadline);
                if (error) {
                    this.discard(environment, session);
                }
            });
        } catch {
            clearTimeout(deadline);
            this.discard(environment, session);
        }
    }

    /** Destroys a session so its in-flight streams fail now and the next send reconnects. */
    private discard(environment: PushEnvironment, session: http2.ClientHttp2Session) {
        if (this.sessions.get(environment) === session) {
            this.sessions.delete(environment);
        }
        if (!session.destroyed) {
            session.destroy();
        }
    }
}

function readReason(body: string): string | null {
    if (!body) {
        return null;
    }
    try {
        const parsed = JSON.parse(body) as { reason?: unknown };
        return typeof parsed.reason === 'string' ? parsed.reason : null;
    } catch {
        return null;
    }
}

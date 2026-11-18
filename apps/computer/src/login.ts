import { randomBytes } from 'node:crypto';
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installEnterToOpenUrl, openUrlInBrowser } from './browser-handoff.ts';
import { stdoutRenderer } from './cli/render.ts';
import { normalizeHttpOrigin } from './haus-origin.ts';

const loginSessionFilename = 'login.json';

interface ComputerLoginBeginResponse {
    deviceCode: string;
    expiresAt: string;
    pollingIntervalMs: number;
    userCode: string;
    verificationUrl: string;
}

interface ComputerLoginPendingResponse {
    pollingIntervalMs: number;
    status: 'pending';
}

interface ComputerLoginRefreshResponse extends ComputerLoginSession {
    status: 'refreshed';
}

interface ComputerLoginRevokeResponse {
    status: 'revoked';
}

export interface ComputerLoginSession {
    accessToken: string;
    accessTokenExpiresAt: string;
    origin: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
    sessionId: string;
}

interface ComputerLoginApprovedResponse extends ComputerLoginSession {
    status: 'approved';
}

interface ComputerLoginCompletedResponse {
    status: 'completed';
}

type ComputerLoginPollResponse = ComputerLoginApprovedResponse | ComputerLoginPendingResponse;
export type ComputerLoginPurpose = 'login' | 'setup';

export async function runComputerLogin(options: {
    complete?: boolean;
    dataRoot: string;
    purpose?: ComputerLoginPurpose;
    replace?: boolean;
    serverOrigin: string;
}): Promise<ComputerLoginSession> {
    const origin = normalizeHttpOrigin(options.serverOrigin);
    const current = await readComputerLoginSession(options.dataRoot);
    if (current && !options.replace) {
        if (current.origin !== origin) {
            throw new Error(
                `Haus Computer is already signed in to ${current.origin}. Run "haus-computer login --replace" to use ${origin}.`
            );
        }
        try {
            const session = await ensureComputerLoginSession({
                dataRoot: options.dataRoot,
                session: current,
            });
            console.log(stdoutRenderer.ok('Reused the saved Haus Computer login.'));
            return session;
        } catch (cause) {
            if (!canStartFreshLogin(cause)) {
                throw cause;
            }
        }
    }
    const started = await postJson<ComputerLoginBeginResponse>(origin, '/computer/login', {
        origin,
        ...(options.purpose === 'setup' ? { purpose: options.purpose } : {}),
    });
    assertBeginResponse(started);

    const browserOpenEnabled = process.env.HAUS_COMPUTER_DISABLE_BROWSER_OPEN !== '1';
    const enterOpensBrowser = browserOpenEnabled && process.stdin.isTTY === true;
    let browserOpenRequested = false;
    if (browserOpenEnabled) {
        try {
            openUrlInBrowser(started.verificationUrl);
            browserOpenRequested = true;
        } catch {
            // The printed URL and code remain the manual fallback.
        }
    }

    console.log('Sign in Haus Computer:');
    console.log(`Verification URL: ${started.verificationUrl}`);
    console.log(`User code: ${started.userCode}`);
    console.log(
        browserOpenRequested
            ? enterOpensBrowser
                ? "Opened automatically. If it didn't open, press Enter to try again."
                : "Opened automatically. If it didn't open, use the URL above."
            : enterOpensBrowser
              ? 'Press Enter to open the URL, or open it manually.'
              : 'Open the URL above and enter the code if needed.'
    );

    const cleanupEnterToOpen = enterOpensBrowser
        ? installEnterToOpenUrl({ input: process.stdin, url: started.verificationUrl })
        : () => {};
    try {
        for (;;) {
            const result = await postJson<ComputerLoginPollResponse>(
                origin,
                '/computer/login/poll',
                {
                    deviceCode: started.deviceCode,
                }
            );
            assertPollResponse(result);
            if (result.status === 'approved') {
                assertOriginBoundSession(result, origin);
                const { status: _status, ...session } = result;
                await writeComputerLoginSession(options.dataRoot, session);
                if (options.complete !== false) {
                    await completeComputerLogin(session);
                    console.log(stdoutRenderer.ok('Haus Computer signed in.'));
                }
                return session;
            }
            await Bun.sleep(result.pollingIntervalMs);
        }
    } finally {
        cleanupEnterToOpen();
    }
}

export async function resolveComputerLogin(options: {
    allowLogin: boolean;
    complete?: boolean;
    dataRoot: string;
    purpose?: ComputerLoginPurpose;
    serverOrigin: string;
}): Promise<ComputerLoginSession> {
    const origin = normalizeHttpOrigin(options.serverOrigin);
    const current = await readComputerLoginSession(options.dataRoot);
    if (!current) {
        if (!options.allowLogin) {
            throw new Error('Haus Computer is not signed in. Run "haus-computer login" first.');
        }
        return await runComputerLogin({
            complete: options.complete,
            dataRoot: options.dataRoot,
            purpose: options.purpose,
            serverOrigin: origin,
        });
    }
    if (current.origin !== origin) {
        throw new Error(
            `Haus Computer is already signed in to ${current.origin}. Run "haus-computer login --replace" to use ${origin}.`
        );
    }
    try {
        return await ensureComputerLoginSession({
            dataRoot: options.dataRoot,
            session: current,
        });
    } catch (cause) {
        if (options.allowLogin && canStartFreshLogin(cause)) {
            return await runComputerLogin({
                complete: options.complete,
                dataRoot: options.dataRoot,
                purpose: options.purpose,
                replace: true,
                serverOrigin: origin,
            });
        }
        if (!options.allowLogin) {
            throw new Error(
                'The saved Haus Computer login could not be refreshed. Run "haus-computer login" again.'
            );
        }
        throw cause;
    }
}

export async function completeComputerLogin(session: ComputerLoginSession): Promise<void> {
    const completed = await postJson<ComputerLoginCompletedResponse>(
        session.origin,
        '/computer/login/complete',
        { accessToken: session.accessToken }
    );
    if (completed.status !== 'completed') {
        throw new Error('Server returned an invalid Computer login completion.');
    }
}

export async function readComputerLoginSession(
    dataRoot: string
): Promise<ComputerLoginSession | null> {
    try {
        const value = JSON.parse(
            await Bun.file(join(dataRoot, loginSessionFilename)).text()
        ) as Partial<ComputerLoginSession>;
        if (
            typeof value.accessToken !== 'string' ||
            typeof value.accessTokenExpiresAt !== 'string' ||
            typeof value.origin !== 'string' ||
            typeof value.refreshToken !== 'string' ||
            typeof value.refreshTokenExpiresAt !== 'string' ||
            typeof value.sessionId !== 'string' ||
            !isAccessToken(value.accessToken) ||
            !isRefreshToken(value.refreshToken) ||
            !isSessionId(value.sessionId)
        ) {
            return null;
        }
        const origin = normalizeHttpOrigin(value.origin);
        if (
            !(
                Number.isFinite(Date.parse(value.accessTokenExpiresAt)) &&
                Number.isFinite(Date.parse(value.refreshTokenExpiresAt))
            )
        ) {
            return null;
        }
        return {
            accessToken: value.accessToken,
            accessTokenExpiresAt: value.accessTokenExpiresAt,
            origin,
            refreshToken: value.refreshToken,
            refreshTokenExpiresAt: value.refreshTokenExpiresAt,
            sessionId: value.sessionId,
        };
    } catch {
        return null;
    }
}

export async function ensureComputerLoginSession(options: {
    dataRoot: string;
    session: ComputerLoginSession;
}): Promise<ComputerLoginSession> {
    if (Date.parse(options.session.accessTokenExpiresAt) > Date.now()) {
        return options.session;
    }
    const refreshed = await postJson<ComputerLoginRefreshResponse>(
        options.session.origin,
        '/computer/login/refresh',
        {
            refreshToken: options.session.refreshToken,
            sessionId: options.session.sessionId,
        }
    );
    assertRefreshResponse(refreshed, options.session);
    const { status: _status, ...refreshedSession } = refreshed;
    const session = { ...refreshedSession, origin: normalizeHttpOrigin(refreshedSession.origin) };
    await writeComputerLoginSession(options.dataRoot, session);
    return session;
}

export async function revokeComputerLoginSession(
    session: ComputerLoginSession
): Promise<ComputerLoginRevokeResponse> {
    const revoked = await postJson<ComputerLoginRevokeResponse>(
        session.origin,
        '/computer/login/revoke',
        {
            refreshToken: session.refreshToken,
            sessionId: session.sessionId,
        }
    );
    if (revoked.status !== 'revoked') {
        throw new Error('Server returned an invalid Computer login revocation.');
    }
    return revoked;
}

export async function writeComputerLoginSession(
    dataRoot: string,
    session: ComputerLoginSession
): Promise<string> {
    await mkdir(dataRoot, { mode: 0o700, recursive: true });
    await chmod(dataRoot, 0o700);
    const destination = join(dataRoot, loginSessionFilename);
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    try {
        await writeFile(temporary, `${JSON.stringify(session)}\n`, { mode: 0o600 });
        await chmod(temporary, 0o600);
        await rename(temporary, destination);
    } finally {
        await rm(temporary, { force: true });
    }
    return destination;
}

class ComputerLoginRequestError extends Error {
    constructor(
        message: string,
        readonly code: string | undefined,
        readonly status: number
    ) {
        super(message);
        this.name = 'ComputerLoginRequestError';
    }
}

async function postJson<Response>(origin: string, path: string, body: object): Promise<Response> {
    const response = await fetch(new URL(path, origin), {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        redirect: 'error',
    });
    let payload: Response & { code?: string; error?: string };
    try {
        payload = (await response.json()) as Response & { code?: string; error?: string };
    } catch {
        payload = {} as Response & { code?: string; error?: string };
    }
    if (!response.ok) {
        throw new ComputerLoginRequestError(
            payload.error ?? 'Computer login was rejected.',
            payload.code,
            response.status
        );
    }
    return payload;
}

function assertRefreshResponse(
    value: ComputerLoginRefreshResponse,
    previous: ComputerLoginSession
): asserts value is ComputerLoginRefreshResponse {
    if (
        value.status !== 'refreshed' ||
        !isAccessToken(value.accessToken) ||
        !isRefreshToken(value.refreshToken) ||
        !isSessionId(value.sessionId) ||
        value.sessionId !== previous.sessionId ||
        normalizeHttpOrigin(value.origin) !== previous.origin ||
        !Number.isFinite(Date.parse(value.accessTokenExpiresAt)) ||
        !Number.isFinite(Date.parse(value.refreshTokenExpiresAt))
    ) {
        throw new Error('Server returned an invalid refreshed Computer login session.');
    }
}

function canStartFreshLogin(cause: unknown) {
    return (
        cause instanceof ComputerLoginRequestError && (cause.status === 401 || cause.status === 409)
    );
}

function isAccessToken(value: string) {
    return /^gcl_at_[A-Za-z0-9_-]{43}$/u.test(value);
}

function isRefreshToken(value: string) {
    return /^gcl_rt_[A-Za-z0-9_-]{43}$/u.test(value);
}

function isSessionId(value: string) {
    return /^cls_[A-Za-z0-9_-]{16}$/u.test(value);
}

function assertBeginResponse(
    value: ComputerLoginBeginResponse
): asserts value is ComputerLoginBeginResponse {
    if (
        typeof value.deviceCode !== 'string' ||
        typeof value.expiresAt !== 'string' ||
        !Number.isSafeInteger(value.pollingIntervalMs) ||
        value.pollingIntervalMs <= 0 ||
        typeof value.userCode !== 'string' ||
        typeof value.verificationUrl !== 'string'
    ) {
        throw new Error('Server returned an invalid Computer login grant.');
    }
}

function assertPollResponse(
    value: ComputerLoginPollResponse
): asserts value is ComputerLoginPollResponse {
    if (value.status === 'pending') {
        if (!Number.isSafeInteger(value.pollingIntervalMs) || value.pollingIntervalMs <= 0) {
            throw new Error('Server returned an invalid Computer login polling interval.');
        }
        return;
    }
    if (
        typeof value.accessToken !== 'string' ||
        typeof value.accessTokenExpiresAt !== 'string' ||
        typeof value.origin !== 'string' ||
        typeof value.refreshToken !== 'string' ||
        typeof value.refreshTokenExpiresAt !== 'string' ||
        typeof value.sessionId !== 'string'
    ) {
        throw new Error('Server returned an invalid Computer login session.');
    }
}

function assertOriginBoundSession(session: ComputerLoginApprovedResponse, requestedOrigin: string) {
    if (normalizeHttpOrigin(session.origin) !== requestedOrigin) {
        throw new Error('Server returned a Computer login session for another origin.');
    }
}

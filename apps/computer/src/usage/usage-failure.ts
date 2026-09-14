import type { UsageErrorCode } from '@haus/api';

export interface UsageFailure {
    code: UsageErrorCode;
    errorClass: string;
    provider: string;
}

export type UsageFailureLog = (failure: UsageFailure) => void;

/**
 * Providers throw typed errors, so the reported code comes from the error class
 * rather than its wording. A guarded-backoff `ClaudeUsageRequestError` carries
 * no "HTTP" or "status" token, and reading it as `unknown` made the aggregate
 * cache discard the provider's last good snapshot.
 */
export function usageFailure(
    provider: string,
    cause: unknown,
    message: string,
    log: UsageFailureLog
): { code: UsageErrorCode; message: string; name: string } {
    const code = usageErrorCode(cause);
    log({ code, errorClass: errorClassOf(cause), provider });
    return { code, message, name: 'UsageError' };
}

/**
 * One line per failed provider read. The class name and code are the whole
 * payload: raw provider messages can carry account or token detail.
 */
export function reportUsageFailure(failure: UsageFailure): void {
    console.warn(
        `usage.provider.read_failed provider=${failure.provider} error=${failure.errorClass} code=${failure.code}`
    );
}

export function reportUsageRecovery(provider: string): void {
    console.info(`usage.provider.read_recovered provider=${provider}`);
}

export interface UsageFailureReporter {
    log: UsageFailureLog;
    settle: () => void;
}

/**
 * One line per change, not one line per read. Every unconfigured provider fails
 * on every 15-minute pass, and repeating an unchanged failure buried the
 * transitions worth reading. A settled pass that stopped reporting a provider
 * is that provider's recovery.
 */
export function createUsageFailureReporter(
    options: { log?: UsageFailureLog; logRecovery?: (provider: string) => void } = {}
): UsageFailureReporter {
    const log = options.log ?? reportUsageFailure;
    const logRecovery = options.logRecovery ?? reportUsageRecovery;
    const reported = new Map<string, UsageErrorCode>();
    let pass = new Set<string>();

    return {
        log: (failure) => {
            pass.add(failure.provider);
            if (reported.get(failure.provider) === failure.code) {
                return;
            }
            reported.set(failure.provider, failure.code);
            log(failure);
        },
        settle: () => {
            for (const provider of [...reported.keys()]) {
                if (!pass.has(provider)) {
                    reported.delete(provider);
                    logRecovery(provider);
                }
            }
            pass = new Set();
        },
    };
}

function usageErrorCode(cause: unknown): UsageErrorCode {
    const errorClass = errorClassOf(cause);
    if (errorClass.includes('Auth')) {
        return 'auth';
    }
    if (errorClass.includes('Parse') || errorClass === 'ZodError') {
        return 'parse';
    }
    if (errorClass.includes('Request') || cause instanceof TypeError) {
        return 'request';
    }
    return messageUsageErrorCode(cause instanceof Error ? cause.message : '');
}

/** Fallback for readers that still throw a plain `Error`. */
function messageUsageErrorCode(message: string): UsageErrorCode {
    if (
        /\b(auth|authentication|credential|login|signed out)\b/i.test(message) ||
        message.includes('rejected the Computer management key')
    ) {
        return 'auth';
    }
    return message.includes('HTTP') || message.includes('status') ? 'request' : 'unknown';
}

function errorClassOf(cause: unknown): string {
    return cause instanceof Error ? cause.name : typeof cause;
}

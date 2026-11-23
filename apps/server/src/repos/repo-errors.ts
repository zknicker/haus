import { TRPCError } from '@trpc/server';

const refusalCodes = {
    conflict: { http: 409, trpc: 'CONFLICT' },
    denied: { http: 403, trpc: 'FORBIDDEN' },
    failed: { http: 422, trpc: 'UNPROCESSABLE_CONTENT' },
    'in-use': { http: 409, trpc: 'CONFLICT' },
    missing: { http: 404, trpc: 'NOT_FOUND' },
    offline: { http: 409, trpc: 'CONFLICT' },
} as const;

export type RepoFolderRefusal = keyof typeof refusalCodes;

export class RepoFolderRefusalError extends Error {
    constructor(
        readonly reason: RepoFolderRefusal,
        message: string
    ) {
        super(message);
        this.name = 'RepoFolderRefusalError';
    }

    get httpStatus() {
        return refusalCodes[this.reason].http;
    }
}

export function repoFolderTrpcError(cause: unknown) {
    return cause instanceof RepoFolderRefusalError
        ? new TRPCError({ cause, code: refusalCodes[cause.reason].trpc, message: cause.message })
        : cause;
}

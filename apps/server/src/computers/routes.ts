import { runnerMintRequestSchema, runnerRevokeRequestSchema } from '@haus/api';
import type { OtlpTelemetryRelay } from '@haus/effect';
import type { FastifyInstance } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import { attachComputer, ComputerAttachmentError } from './attachment-service.ts';
import {
    attachComputerSchema,
    beginComputerLoginSchema,
    completeComputerLoginSchema,
    inspectComputerLoginSchema,
    pollComputerLoginSchema,
    refreshComputerLoginSchema,
    revokeComputerLoginSchema,
    validateComputerCredentialSchema,
} from './contracts.ts';
import { completeComputerLogin } from './login-completion.ts';
import { ComputerLoginError } from './login-errors.ts';
import { beginComputerLogin, pollComputerLogin } from './login-service.ts';
import {
    inspectComputerLogin,
    refreshComputerLogin,
    revokeComputerLogin,
} from './login-session-service.ts';
import { mintRunnerCredential, revokeRunnerCredential } from './runner-credentials.ts';
import { ComputerSetupDeniedError, validateComputerCredential } from './service.ts';
import { registerComputerTelemetryRoutes } from './telemetry-routes.ts';

export function registerComputerRoutes(
    app: FastifyInstance,
    options: {
        appOrigin: string;
        db: HausDatabase;
        telemetryRelay?: OtlpTelemetryRelay | null;
    }
) {
    registerComputerTelemetryRoutes(app, {
        auth: { db: options.db, kind: 'database' },
        relay: options.telemetryRelay ?? null,
    });
    app.post('/computer/attach', async (request, reply) => {
        try {
            const input = attachComputerSchema.parse(request.body);
            return await attachComputer(options.db, input);
        } catch (cause) {
            if (cause instanceof ComputerLoginError) {
                return loginError(reply, cause);
            }
            return attachmentError(reply, cause);
        }
    });
    app.post('/computer/login', async (request, reply) => {
        try {
            const input = beginComputerLoginSchema.parse(request.body);
            const started = await beginComputerLogin(options.db, input);
            const verificationUrl = new URL('/computer/login', options.appOrigin);
            verificationUrl.searchParams.set('code', started.userCode);
            return {
                deviceCode: started.deviceCode,
                expiresAt: started.expiresAt.toISOString(),
                pollingIntervalMs: started.pollingIntervalMs,
                userCode: started.userCode,
                verificationUrl: verificationUrl.toString(),
            };
        } catch (cause) {
            return loginError(reply, cause);
        }
    });
    app.post('/computer/login/poll', async (request, reply) => {
        try {
            const input = pollComputerLoginSchema.parse(request.body);
            return await pollComputerLogin(options.db, input);
        } catch (cause) {
            return loginError(reply, cause);
        }
    });
    app.post('/computer/login/complete', async (request, reply) => {
        try {
            const input = completeComputerLoginSchema.parse(request.body);
            return await completeComputerLogin(options.db, input);
        } catch (cause) {
            return loginError(reply, cause);
        }
    });
    app.post('/computer/login/refresh', async (request, reply) => {
        try {
            const input = refreshComputerLoginSchema.parse(request.body);
            return await refreshComputerLogin(options.db, input);
        } catch (cause) {
            return loginError(reply, cause);
        }
    });
    app.post('/computer/login/inspect', async (request, reply) => {
        try {
            const input = inspectComputerLoginSchema.parse(request.body);
            return await inspectComputerLogin(options.db, input);
        } catch (cause) {
            return loginError(reply, cause);
        }
    });
    app.post('/computer/login/revoke', async (request, reply) => {
        try {
            const input = revokeComputerLoginSchema.parse(request.body);
            return await revokeComputerLogin(options.db, input);
        } catch (cause) {
            return loginError(reply, cause);
        }
    });
    app.post('/computer/validate', async (request, reply) => {
        try {
            const input = validateComputerCredentialSchema.parse(request.body);
            return await validateComputerCredential(options.db, input);
        } catch (cause) {
            return setupError(reply, cause);
        }
    });
    app.post('/computer/runner/mint', async (request, reply) => {
        try {
            const input = runnerMintRequestSchema.parse(request.body);
            return await mintRunnerCredential(options.db, input);
        } catch (cause) {
            return setupError(reply, cause);
        }
    });
    app.post('/computer/runner/revoke', async (request, reply) => {
        try {
            const input = runnerRevokeRequestSchema.parse(request.body);
            return await revokeRunnerCredential(options.db, input);
        } catch (cause) {
            return setupError(reply, cause);
        }
    });
}

function attachmentError(
    reply: { code(statusCode: number): { send(payload: unknown): unknown } },
    cause: unknown
) {
    const message = cause instanceof Error ? cause.message : 'Computer attachment was rejected.';
    const status = cause instanceof ComputerAttachmentError ? cause.httpStatus : 400;
    return reply.code(status).send({
        ...(cause instanceof ComputerAttachmentError ? { code: cause.code } : {}),
        error: message,
    });
}

function setupError(
    reply: { code(statusCode: number): { send(payload: unknown): unknown } },
    cause: unknown
) {
    const message = cause instanceof Error ? cause.message : 'Computer request was rejected.';
    const status = cause instanceof ComputerSetupDeniedError ? 403 : 400;
    return reply.code(status).send({
        ...(cause instanceof ComputerSetupDeniedError && cause.code ? { code: cause.code } : {}),
        error: message,
    });
}

function loginError(
    reply: { code(statusCode: number): { send(payload: unknown): unknown } },
    cause: unknown
) {
    const message = cause instanceof Error ? cause.message : 'Computer login was rejected.';
    const status = cause instanceof ComputerLoginError ? cause.httpStatus : 400;
    return reply.code(status).send({
        ...(cause instanceof ComputerLoginError ? { code: cause.code } : {}),
        error: message,
    });
}

import type { OtlpSignal, OtlpTelemetryRelay } from '@haus/effect';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema/agents.ts';
import { hashComputerSecret, resolveComputerCredential } from './service.ts';
import { sanitizeComputerTelemetry, type TelemetryComputer } from './telemetry-payload.ts';

const protobufContentType = 'application/x-protobuf';
const relayBodyLimit = 1024 * 1024;

type ComputerTelemetryAuth =
    | {
          readonly db: HausDatabase;
          readonly kind: 'database';
      }
    | {
          readonly authenticate: (credential: string) => Promise<TelemetryComputer>;
          readonly kind: 'custom';
      };

export function registerComputerTelemetryRoutes(
    app: FastifyInstance,
    options: {
        readonly auth: ComputerTelemetryAuth;
        readonly relay: OtlpTelemetryRelay | null;
        readonly environment?: 'development' | 'production' | 'test';
    }
) {
    if (!app.hasContentTypeParser(protobufContentType)) {
        app.addContentTypeParser(
            protobufContentType,
            { parseAs: 'buffer' },
            (_request, body, done) => done(null, body)
        );
    }
    registerSignalRoute(app, options, 'traces');
    registerSignalRoute(app, options, 'metrics');
}

function registerSignalRoute(
    app: FastifyInstance,
    options: {
        readonly auth: ComputerTelemetryAuth;
        readonly relay: OtlpTelemetryRelay | null;
        readonly environment?: 'development' | 'production' | 'test';
    },
    signal: OtlpSignal
) {
    app.post(
        `/computer/telemetry/v1/${signal}`,
        { bodyLimit: relayBodyLimit },
        async (request, reply) => {
            const credential = bearerCredential(request.headers.authorization);
            if (!credential) {
                return reply.code(401).send({ error: 'Computer credential was rejected.' });
            }
            let computer: TelemetryComputer;
            try {
                computer = await authenticate(options.auth, credential);
            } catch {
                return reply.code(401).send({ error: 'Computer credential was rejected.' });
            }
            if (!options.relay) {
                return reply.code(503).send({ error: 'Telemetry relay is not configured.' });
            }
            if (!Buffer.isBuffer(request.body)) {
                return reply.code(415).send({ error: 'OTLP protobuf is required.' });
            }
            let payload: Uint8Array;
            try {
                payload = sanitizeComputerTelemetry(
                    signal,
                    request.body,
                    computer,
                    options.environment ?? relayEnvironment()
                );
            } catch {
                return reply.code(400).send({ error: 'OTLP protobuf was invalid.' });
            }
            try {
                await options.relay.forward(signal, payload);
                return reply.code(200).send();
            } catch {
                return reply.code(502).send({ error: 'Telemetry upstream was unavailable.' });
            }
        }
    );
}

async function authenticate(
    auth: ComputerTelemetryAuth,
    credential: string
): Promise<TelemetryComputer> {
    if (auth.kind === 'custom') {
        return auth.authenticate(credential);
    }
    const computer = await resolveComputerCredential(auth.db, hashComputerSecret(credential));
    const agents = await auth.db
        .select({
            id: agentsTable.id,
            desiredModelId: agentsTable.desiredModelId,
            desiredRuntimeId: agentsTable.desiredRuntimeId,
        })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.computerId, computer.id),
                eq(agentsTable.serverId, computer.serverId)
            )
        );
    return { ...computer, agents };
}

function relayEnvironment(): 'development' | 'production' | 'test' {
    const value = process.env.OTEL_RESOURCE_ATTRIBUTES?.split(',')
        .map((entry) => entry.trim().split('='))
        .find(([key]) => key === 'deployment.environment.name')?.[1]
        ?.trim();
    if (value === 'development' || value === 'production' || value === 'test') {
        return value;
    }
    return process.env.NODE_ENV === 'production'
        ? 'production'
        : process.env.NODE_ENV === 'test'
          ? 'test'
          : 'development';
}

function bearerCredential(header: string | undefined): string | null {
    if (!header?.startsWith('Bearer ')) {
        return null;
    }
    const credential = header.slice('Bearer '.length);
    return credential.length > 0 && credential.length <= 512 ? credential : null;
}

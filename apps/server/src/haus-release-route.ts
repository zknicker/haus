import { hausReleaseSnapshotSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import type { HausReleaseIdentity } from './haus-release-identity.ts';

const productionSnapshotUrl = 'https://releases.haus.chat/haus/latest.json';
type FetchSnapshot = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function registerHausReleaseRoute(
    app: FastifyInstance,
    options: {
        fetchSnapshot?: FetchSnapshot;
        releaseIdentity?: HausReleaseIdentity | null;
        snapshotUrl?: string;
    } = {}
) {
    app.get('/api/haus-release', async (_request, reply) => {
        const response = await readHausReleaseDiscovery(options);
        if (!response.ok) {
            return reply.code(502).send(response.error);
        }
        reply.header('cache-control', 'private, max-age=60');
        return response.value;
    });
}

export async function readHausReleaseDiscovery(options: {
    fetchSnapshot?: FetchSnapshot;
    releaseIdentity?: HausReleaseIdentity | null;
    snapshotUrl?: string;
}) {
    const response = await (options.fetchSnapshot ?? fetch)(
        options.snapshotUrl ?? productionSnapshotUrl
    );
    if (!response.ok) {
        return {
            error: { code: 'release_snapshot_unavailable', status: response.status },
            ok: false as const,
        };
    }
    const latest = hausReleaseSnapshotSchema.parse(await response.json());
    return {
        ok: true as const,
        value: {
            latest,
            running: {
                agent: null,
                server: options.releaseIdentity?.serverVersion ?? null,
            },
        },
    };
}

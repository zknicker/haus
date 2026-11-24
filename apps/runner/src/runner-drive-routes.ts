import type { StandInRoutes } from './runner-test-server.ts';

export function driveRoutes(
    handle: string,
    files: Map<string, string>,
    projectKey: string | null = null
) {
    const ids = new Map([...files.keys()].map((path, index) => [path, `art_${index}`]));
    const routes: StandInRoutes = {
        '/api/agent/artifacts/by-path': (_body, url) => {
            const path = url.searchParams.get('path') ?? '';
            const id = ids.get(path);
            return id && files.has(path)
                ? Response.json({ artifact: { artifact_id: id, path } })
                : Response.json({ code: 'NOT_FOUND', message: path }, { status: 404 });
        },
        '/api/agent/managed-skills/notice': () => Response.json({ pending: {} }),
        '/api/agent/profile': () => Response.json({ profile: { handle, projectKey } }),
    };
    for (const [path, id] of ids) {
        routes[`/api/agent/artifacts/${id}/download`] = (_body, url) =>
            Response.json({ download_url: new URL(`/drive-bytes/${id}`, url).href });
        routes[`/drive-bytes/${id}`] = () => new Response(files.get(path) ?? '');
    }
    return routes;
}

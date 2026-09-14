import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const websiteBuildSchema = z.object({ buildId: z.string().uuid() });

export function useWebsiteUpdate() {
    const build = useQuery({
        queryKey: ['haus-website-build'],
        queryFn: fetchWebsiteBuild,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
        // Deployment has no durable event; poll and recheck when returning to Haus.
        staleTime: 30_000,
    });
    return Boolean(build.data && build.data.buildId !== import.meta.env.VITE_HAUS_APP_BUILD_ID);
}

export async function fetchWebsiteBuild({ signal }: { signal: AbortSignal }) {
    const response = await fetch('/haus-app-build.json', { cache: 'no-store', signal });
    if (!response.ok) {
        throw new Error(`Haus website update check failed (${response.status}).`);
    }
    return websiteBuildSchema.parse(await response.json());
}

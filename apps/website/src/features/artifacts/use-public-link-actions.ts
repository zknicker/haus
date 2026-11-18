import { toast } from '@heroui/react';
import { useArtifactPublicLinkMutations } from '../../hooks/artifacts/use-artifact-public-link.ts';
import { copyArtifactLink } from './artifact-link.ts';

/** The ⋮ menu actions for public links: copy (creating the link first) and disable. */
export function usePublicLinkActions(serverId: string) {
    const mutations = useArtifactPublicLinkMutations(serverId);
    return {
        copy: async (artifactId: string) => {
            try {
                await copyArtifactLink(await mutations.enable(artifactId), 'Public link copied');
            } catch (error) {
                failed('Could not create the public link', error);
            }
        },
        disable: async (artifactId: string) => {
            try {
                await mutations.disable(artifactId);
                toast.success('Public link disabled');
            } catch (error) {
                failed('Could not disable the public link', error);
            }
        },
    };
}

function failed(title: string, error: unknown) {
    toast.danger(title, { description: error instanceof Error ? error.message : undefined });
}

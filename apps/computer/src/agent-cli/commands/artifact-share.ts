import { artifactPublicLinkResultSchema } from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { artifactRoute, resolveArtifactId } from './artifact-target.ts';

/** `haus files share`: a public link anyone outside the Server can open or embed. */
export const ARTIFACT_SHARE_SUBCOMMAND: SubCommand = {
    name: 'share',
    summary: 'Get a public link to a shared file, for people and tools outside Haus',
    usage: 'haus files share <id|link|path> [--disable]',
    positionals: ['<id|link|path>'],
    examples: ['haus files share designs/tee-front.png', 'haus files share art_123 --disable'],
    flags: [{ name: '--disable', description: 'Turn the public link off' }],
    notes: [
        'Anyone with the url sees the file’s current version, so the link stays current as you push revisions. Images embed inline; append /thumbnail for a smaller WebP preview.',
        'Sharing again returns the same url. --disable turns it off (yours, or as an Owner/Admin); sharing later issues a new url.',
    ],
    run: (args) => runArtifactShare(args),
};

export async function runArtifactShare(
    args: ParsedArgs,
    client: AgentApiRequester = createAgentApiClient()
): Promise<number> {
    const id = await resolveArtifactId(client, args.positionals[0]);
    const disable = args.flags['--disable'] === true;
    const result = await client.request(
        artifactRoute(id, disable ? '/public-link/disable' : '/public-link'),
        artifactPublicLinkResultSchema,
        { method: 'POST' }
    );
    const output = disable
        ? { artifact_id: result.artifact_id, disabled: true }
        : { artifact_id: result.artifact_id, url: result.link?.url ?? null };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return 0;
}

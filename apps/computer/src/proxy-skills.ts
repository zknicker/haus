import * as z from 'zod';
import {
    createLocalAgentSkill,
    deleteLocalAgentSkill,
    listLocalAgentSkills,
    patchLocalAgentSkill,
    viewLocalAgentSkill,
    writeLocalAgentSkillFile,
} from './agent-skills.ts';

const skillCreateSchema = z.object({
    content: z.string().min(1),
    description: z.string().trim().min(1),
    name: z.string().trim().min(1),
});
const skillPatchSchema = z.object({
    content: z.string().min(1),
    expectedHash: z.string().min(1),
    skillId: z.string().min(1),
});
const skillFileSchema = z.object({
    content: z.string(),
    expectedHash: z.string().min(1).nullable(),
    filePath: z.string().min(1),
    skillId: z.string().min(1),
});

export async function handleSkillRequest(
    request: Request,
    url: URL,
    input: { agentId?: string; skillsDir?: string }
): Promise<Response | null> {
    if (!(input.agentId && input.skillsDir && url.pathname.startsWith('/api/agent/skills'))) {
        return null;
    }
    try {
        if (url.pathname === '/api/agent/skills' && request.method === 'GET') {
            return Response.json(await listLocalAgentSkills(input.skillsDir));
        }
        if (url.pathname === '/api/agent/skills/create' && request.method === 'POST') {
            return Response.json(
                await createLocalAgentSkill(
                    input.skillsDir,
                    skillCreateSchema.parse(await request.json())
                )
            );
        }
        if (url.pathname === '/api/agent/skills/patch' && request.method === 'POST') {
            return Response.json(
                await patchLocalAgentSkill(
                    input.skillsDir,
                    skillPatchSchema.parse(await request.json())
                )
            );
        }
        if (url.pathname === '/api/agent/skills/write-file' && request.method === 'POST') {
            return Response.json(
                await writeLocalAgentSkillFile(
                    input.skillsDir,
                    skillFileSchema.parse(await request.json())
                )
            );
        }
        const skillId = decodeURIComponent(url.pathname.slice('/api/agent/skills/'.length));
        if (skillId && request.method === 'GET') {
            return Response.json(await viewLocalAgentSkill(input.skillsDir, skillId));
        }
        if (skillId && request.method === 'DELETE') {
            return Response.json(
                await deleteLocalAgentSkill(input.skillsDir, input.agentId, skillId)
            );
        }
        return null;
    } catch (error) {
        return Response.json(
            {
                code: 'INVALID_ARG',
                message: error instanceof Error ? error.message : String(error),
            },
            { status: 409 }
        );
    }
}

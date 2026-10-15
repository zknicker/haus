import {
    attribution,
    confirmed,
    createOnce,
    definedFields,
    type LinearCallContext,
} from '../call-context.ts';

export const commentFields = `id body url createdAt updatedAt
    user { id displayName } botActor { name userDisplayName } parent { id }`;

interface CreatedComment {
    id: string;
    updatedAt: string;
}

/** One comment create at `opIndex`, attributed to the Agent when the workspace actor posts. */
export async function createComment(
    context: LinearCallContext,
    options: { body: string; issueId: string; opIndex: number; parentId?: string }
): Promise<CreatedComment> {
    const fields = definedFields({
        body: options.body,
        issueId: options.issueId,
        parentId: options.parentId,
    });
    return await createOnce<CreatedComment>(context, {
        entityType: 'comment',
        fields,
        opIndex: options.opIndex,
        async create(id) {
            const data = await context.linear.request<{
                commentCreate: { success: boolean; comment: CreatedComment | null };
            }>(
                `mutation CreateComment($input: CommentCreateInput!) {
                    commentCreate(input: $input) { success comment { ${commentFields} } }
                }`,
                { input: { ...fields, ...attribution(context.meta), id } }
            );
            return confirmed<CreatedComment>(data.commentCreate, 'comment');
        },
        async readBack(id) {
            const data = await context.linear.request<{ comment: CreatedComment | null }>(
                `query Comment($id: String!) { comment(id: $id) { ${commentFields} } }`,
                { id }
            );
            return data.comment;
        },
    });
}

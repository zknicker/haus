import { attachmentInventoryInputSchema, attachmentInventorySchema } from '@haus/api';
import { inventoryServerAttachments } from '../../attachments/inventory-attachments.ts';
import { attachmentProcedure } from './procedure.ts';

export const inventoryAttachmentsProcedure = attachmentProcedure
    .input(attachmentInventoryInputSchema)
    .output(attachmentInventorySchema)
    .query(
        async ({ ctx, input }) =>
            await inventoryServerAttachments(
                ctx.hausDb,
                ctx.attachmentRoot,
                ctx.member,
                input.serverId
            )
    );

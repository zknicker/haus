import { attachmentReservationSchema, attachmentReserveInputSchema } from '@haus/api';
import { reserveAttachment } from '../../attachments/reserve-attachment.ts';
import { attachmentProcedure } from './procedure.ts';

export const reserveAttachmentProcedure = attachmentProcedure
    .input(attachmentReserveInputSchema)
    .output(attachmentReservationSchema)
    .mutation(async ({ ctx, input }) => await reserveAttachment(ctx.hausDb, ctx.member, input));

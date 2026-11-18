import {
    amazonProductDetailSchema,
    amazonProductIdentitySchema,
    amazonProductResultSchema,
} from '@haus/api';
import { z } from 'zod';
import {
    readAmazonProductDetail,
    readAmazonProductSummary,
} from '../../amazon-products/read-products.ts';
import { memberProcedure } from '../server/procedure.ts';

const productInput = amazonProductIdentitySchema.extend({ serverId: z.string() });

/** One chip's summary; `null` when no RankWrangler account is connected. */
export const amazonProduct = memberProcedure
    .input(productInput)
    .output(amazonProductResultSchema.nullable())
    .query(
        async ({ ctx, input }) =>
            await readAmazonProductSummary(ctx.hausDb, ctx.mcpRuntime, ctx.member, {
                serverId: input.serverId,
                product: { asin: input.asin, marketplaceId: input.marketplaceId },
            })
    );

export const amazonProductDetail = memberProcedure
    .input(productInput)
    .output(amazonProductDetailSchema.nullable())
    .query(
        async ({ ctx, input }) =>
            await readAmazonProductDetail(ctx.hausDb, ctx.mcpRuntime, ctx.member, {
                serverId: input.serverId,
                product: { asin: input.asin, marketplaceId: input.marketplaceId },
            })
    );

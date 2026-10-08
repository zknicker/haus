import {
    amazonProductDetailSchema,
    amazonProductIdentitySchema,
    amazonProductResultSchema,
} from '@haus/api';
import { z } from 'zod';
import {
    readAmazonProductDetail,
    readAmazonProductSummaries,
} from '../../amazon-products/read-products.ts';
import { memberProcedure } from '../server/procedure.ts';

/** One result per requested product; `null` when no RankWrangler account is connected. */
export const amazonProducts = memberProcedure
    .input(
        z.object({
            serverId: z.string(),
            products: z.array(amazonProductIdentitySchema).min(1).max(50),
        })
    )
    .output(z.array(amazonProductResultSchema).nullable())
    .query(async ({ ctx, input }) => {
        const results = await readAmazonProductSummaries(
            ctx.hausDb,
            ctx.mcpRuntime,
            ctx.member,
            input
        );
        return results?.map((result) => amazonProductResultSchema.parse(result)) ?? null;
    });

export const amazonProductDetail = memberProcedure
    .input(amazonProductIdentitySchema.extend({ serverId: z.string() }))
    .output(amazonProductDetailSchema.nullable())
    .query(
        async ({ ctx, input }) =>
            await readAmazonProductDetail(ctx.hausDb, ctx.mcpRuntime, ctx.member, {
                serverId: input.serverId,
                product: { asin: input.asin, marketplaceId: input.marketplaceId },
            })
    );

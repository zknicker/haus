import {
    amazonProductDetailSchema,
    amazonProductIdentitySchema,
    amazonProductSummarySchema,
} from '@haus/api';
import { z } from 'zod';
import { readAmazonProducts } from '../../amazon-products/read-products.ts';
import { memberProcedure } from '../server/procedure.ts';

export const amazonProducts = memberProcedure
    .input(
        z.object({
            serverId: z.string(),
            products: z.array(amazonProductIdentitySchema).min(1).max(50),
        })
    )
    .output(z.array(amazonProductSummarySchema).nullable())
    .query(async ({ ctx, input }) => {
        const result = await readAmazonProducts(ctx.hausDb, ctx.mcpRuntime, ctx.member, {
            ...input,
            detail: false,
        });
        if (result === null) {
            return null;
        }
        return result.map((product) => amazonProductSummarySchema.parse(product));
    });

export const amazonProductDetail = memberProcedure
    .input(amazonProductIdentitySchema.extend({ serverId: z.string() }))
    .output(amazonProductDetailSchema.nullable())
    .query(async ({ ctx, input }) => {
        const result = await readAmazonProducts(ctx.hausDb, ctx.mcpRuntime, ctx.member, {
            serverId: input.serverId,
            products: [{ asin: input.asin, marketplaceId: input.marketplaceId }],
            detail: true,
        });
        if (result === null) {
            return null;
        }
        return result[0] ?? null;
    });

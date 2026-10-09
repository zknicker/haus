/**
 * tRPC batches every procedure name into one path segment, so the App's opening
 * batch runs past Fastify's 100-character `maxParamLength` default and 404s
 * instead of routing — intermittently leaving whole destinations without data.
 */
export const hausFastifyOptions = {
    bodyLimit: 12 * 1024 * 1024,
    logger: false,
    routerOptions: { maxParamLength: 5000 },
} as const;

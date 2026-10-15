import { resolve } from 'node:path';
import { verifyLinearHostedMcp } from '../apps/server/src/hosted-mcp/verify-linear-package.ts';

if (!process.argv[2]) {
    throw new Error('Usage: verify-hosted-mcp-linear PACKAGE_ROOT');
}
await verifyLinearHostedMcp(resolve(process.argv[2]));
console.log('Packaged Linear ready: private MCP discovery and actor metadata refusal verified.');

import { resolve } from 'node:path';
import { verifyHostedMcp } from '../apps/server/src/hosted-mcp/verify-package.ts';

if (!process.argv[2]) {
    throw new Error('Usage: verify-hosted-mcp PACKAGE_ROOT');
}
await verifyHostedMcp(resolve(process.argv[2]));
console.log('Packaged Skool ready: private MCP discovery and provisioning verified.');

import type { ReactNode } from 'react';
import { ConnectionSection } from './connection-section.tsx';
import type { McpConnection } from './mcp-server-shared.ts';

/**
 * What the Server records about this connection that the header does not
 * already say: a muted label column and a value column, one fact per row.
 */
export function McpConnectionFacts({
    connection,
    usesToken,
}: {
    connection: McpConnection;
    /** A bearer-token preset stores its token as a header, but reads as a token. */
    usesToken: boolean;
}) {
    return (
        <ConnectionSection title="Information">
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
                <Fact label="Server">
                    <span className="block truncate font-mono" title={connection.url}>
                        {connection.url}
                    </span>
                </Fact>
                <Fact label="Sign-in">
                    {usesToken ? 'Bearer token' : signInLabels[connection.auth]}
                </Fact>
                <Fact label="Type">{connection.builtIn ? 'Built in' : 'Custom'}</Fact>
            </dl>
        </ConnectionSection>
    );
}

const signInLabels: Record<McpConnection['auth'], string> = {
    headers: 'Headers',
    none: 'None',
    oauth: 'OAuth',
};

function Fact({ children, label }: { children: ReactNode; label: string }) {
    return (
        <>
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 text-foreground">{children}</dd>
        </>
    );
}

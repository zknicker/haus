import type { BuiltInConnectionSectionProps } from './built-in-connection-definition.ts';
import { builtInConnectionDefinition } from './built-in-connection-registry.ts';

/**
 * The sections a connection's built-in definition adds under its signed-in
 * account. Connections without a definition render nothing here.
 */
export function BuiltInConnectionSections({ connection, serverId }: BuiltInConnectionSectionProps) {
    const sections = builtInConnectionDefinition(connection.preset)?.sections;

    return (
        sections?.map(({ id, Section }) => (
            <Section connection={connection} key={id} serverId={serverId} />
        )) ?? null
    );
}

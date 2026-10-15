import type { McpPreset } from '@haus/api';
import type {
    BuiltInConnectionDefinition,
    BuiltInConnectionPlacement,
    BuiltInConnectionSectionProps,
} from './built-in-connection-definition.ts';
import { githubConnectionDefinition } from './github/github-connection-definition.ts';

/** The only lookup from a preset to its built-in connection definition. */
const builtInConnectionDefinitions: ReadonlyMap<McpPreset, BuiltInConnectionDefinition> = new Map(
    [githubConnectionDefinition].map((definition) => [definition.preset, definition])
);

/**
 * The sections a connection's built-in definition places at one spot on its
 * page. Connections without a definition render nothing here.
 */
export function BuiltInConnectionSections({
    connection,
    placement,
    serverId,
}: BuiltInConnectionSectionProps & { placement: BuiltInConnectionPlacement }) {
    const definition = connection.preset
        ? builtInConnectionDefinitions.get(connection.preset)
        : undefined;
    const sections = definition?.sections.filter((section) => section.placement === placement);

    return (
        sections?.map(({ id, Section }) => (
            <Section connection={connection} key={id} serverId={serverId} />
        )) ?? null
    );
}

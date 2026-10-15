import type {
    BuiltInConnectionPlacement,
    BuiltInConnectionSectionProps,
} from './built-in-connection-definition.ts';
import {
    builtInConnectionDefinition,
    builtInConnectionDefinitions,
} from './built-in-connection-registry.ts';

/**
 * The sections a connection's built-in definition places at one spot on its
 * page. Connections without a definition render nothing here.
 */
export function BuiltInConnectionSections({
    connection,
    placement,
    serverId,
}: BuiltInConnectionSectionProps & { placement: BuiltInConnectionPlacement }) {
    const sections = builtInConnectionDefinition(connection.preset)?.sections.filter(
        (section) => section.placement === placement
    );

    return (
        sections?.map(({ id, Section }) => (
            <Section connection={connection} key={id} serverId={serverId} />
        )) ?? null
    );
}

/** Every built-in setup notice, for the connections list a failed first connect returns to. */
export function BuiltInSetupNotices() {
    return builtInConnectionDefinitions.map(({ preset, SetupNotice }) =>
        SetupNotice ? <SetupNotice key={preset} /> : null
    );
}

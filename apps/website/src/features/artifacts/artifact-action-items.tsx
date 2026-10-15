import { Dropdown, Label, Separator } from '@heroui/react';
import { Fragment } from 'react';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import type { ArtifactAction } from './artifact-actions.ts';

/**
 * One action list as menu items, a separator between groups. HeroUI Pro's
 * ContextMenu.Item is Dropdown.Item, so the same items fill a ⋮ dropdown and
 * a right-click menu alike; the menu's own `onAction` runs them.
 */
export function artifactActionItems(actions: readonly ArtifactAction[]) {
    return actions.map((action, index) => (
        <Fragment key={action.id}>
            {index > 0 && actions[index - 1]?.group !== action.group ? (
                <Separator key={`${action.id}-separator`} />
            ) : null}
            <Dropdown.Item
                {...(action.id === 'open' ? opensPlace : {})}
                id={action.id}
                textValue={action.label}
                variant={action.danger ? 'danger' : undefined}
            >
                <Label>{action.label}</Label>
            </Dropdown.Item>
        </Fragment>
    ));
}

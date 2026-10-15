import { Button, Toolbar, Tooltip } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import type { ArtifactAction, SelectionActionId } from './artifact-actions.ts';

/**
 * While several items are selected, the band's controls give way to this
 * stock Toolbar: what is selected ("4 selected · 120 MB"), the selection's
 * actions (the same list its right-click menu shows), and Clear. It sits
 * where the library's controls always sit, so the column stays all content
 * and nothing in it moves; clearing the selection brings the controls back.
 * Labels fold to icon buttons with tooltips when the band is narrow.
 */
export function ArtifactSelectionBar({
    actions,
    onClear,
    onRun,
    summary,
}: {
    actions: readonly ArtifactAction<SelectionActionId>[];
    onClear: () => void;
    onRun: (id: SelectionActionId) => void;
    summary: string;
}) {
    return (
        <Toolbar aria-label="Selected items">
            <span aria-live="polite" className="whitespace-nowrap text-muted text-sm tabular-nums">
                {summary}
            </span>
            {actions.map((action) => (
                <Tooltip closeDelay={0} delay={600} key={action.id}>
                    <Button
                        aria-label={action.label}
                        onPress={() => onRun(action.id)}
                        size="sm"
                        variant={action.danger ? 'danger-soft' : 'ghost'}
                    >
                        <Icon aria-hidden="true" icon={action.icon} size={16} />
                        <span className="@min-[58rem]/band:inline hidden">{action.label}</span>
                    </Button>
                    <Tooltip.Content>{action.label}</Tooltip.Content>
                </Tooltip>
            ))}
            <Tooltip closeDelay={0} delay={600}>
                <Button
                    aria-label="Clear selection"
                    isIconOnly
                    onPress={onClear}
                    size="sm"
                    variant="ghost"
                >
                    <Icon aria-hidden="true" icon={Cancel01Icon} size={16} />
                </Button>
                <Tooltip.Content>Clear selection</Tooltip.Content>
            </Tooltip>
        </Toolbar>
    );
}

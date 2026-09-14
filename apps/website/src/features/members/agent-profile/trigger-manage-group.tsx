import { Button, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';

/**
 * The two things you do to a live Trigger, as named rows. Both actions used to
 * float beside a section title in a different shape each — one beside "When to
 * run", one beside "Fire history" — which read as two more button styles
 * competing with the drawer's own footer pair. Named rows say what the button
 * will do before it is pressed, and Delete stays in the footer where the
 * drawer's own destructive action belongs.
 */
export function TriggerManageGroup({
    canTest,
    isRotating,
    isTesting,
    onRotate,
    onTest,
}: {
    canTest: boolean;
    isRotating: boolean;
    isTesting: boolean;
    onRotate: () => void;
    onTest: () => void;
}) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Manage</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        {/* The hook already reports the result as a toast,
                            so the row does not repeat it underneath. */}
                        <ItemCard.Title>Send a test fire</ItemCard.Title>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Button
                            isDisabled={!canTest}
                            isPending={isTesting}
                            onPress={onTest}
                            size="sm"
                            type="button"
                            variant="secondary"
                        >
                            Test
                        </Button>
                    </ItemCard.Action>
                </ItemCard>
                <Separator />
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Rotate secret</ItemCard.Title>
                        {/* A destructive row earns one clause: what stops
                            working the moment it is pressed. */}
                        <ItemCard.Description className="whitespace-normal">
                            The current secret stops working immediately.
                        </ItemCard.Description>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Button
                            isDisabled={isRotating}
                            onPress={onRotate}
                            size="sm"
                            type="button"
                            variant="danger-soft"
                        >
                            Rotate
                        </Button>
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

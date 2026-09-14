import { Button, Form, Modal } from '@heroui/react';
import { Link01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { JoinServerFields, useJoinServerForm } from './join-server-form.tsx';

const formId = 'join-server-dialog-form';

export function JoinServerDialog({
    isOpen,
    onOpenChange,
}: {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
}) {
    const form = useJoinServerForm();

    return (
        <Modal.Backdrop isDismissable isOpen={isOpen} onOpenChange={onOpenChange}>
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Icon className="bg-default text-foreground">
                            <Icon className="size-5" icon={Link01Icon} />
                        </Modal.Icon>
                        <Modal.Heading>Join a Server</Modal.Heading>
                        <p className="mt-1.5 text-muted text-sm leading-5">
                            Paste an invitation link or token.
                        </p>
                    </Modal.Header>
                    <Modal.Body>
                        <Form
                            id={formId}
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (!form.isSubmittable) {
                                    return;
                                }
                                form.submit();
                                onOpenChange(false);
                            }}
                        >
                            <JoinServerFields form={form} />
                        </Form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button slot="close" variant="secondary">
                            Cancel
                        </Button>
                        <Button form={formId} isDisabled={!form.isSubmittable} type="submit">
                            Continue
                        </Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

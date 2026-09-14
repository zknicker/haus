import { Button, Form, Modal } from '@heroui/react';
import { ServerStack01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { CreateServerFields, useCreateServerForm } from './create-server-form.tsx';

const formId = 'create-server-dialog-form';

export function CreateServerDialog({
    isOpen,
    onOpenChange,
}: {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
}) {
    const form = useCreateServerForm(() => onOpenChange(false));

    return (
        <Modal.Backdrop isDismissable isOpen={isOpen} onOpenChange={onOpenChange}>
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Icon className="bg-default text-foreground">
                            <Icon className="size-5" icon={ServerStack01Icon} />
                        </Modal.Icon>
                        <Modal.Heading>Create a Server</Modal.Heading>
                        <p className="mt-1.5 text-muted text-sm leading-5">
                            Start a new place for your people and Agents.
                        </p>
                    </Modal.Header>
                    <Modal.Body>
                        <Form
                            className="flex flex-col items-stretch gap-4"
                            id={formId}
                            onSubmit={(event) => {
                                event.preventDefault();
                                form.submit();
                            }}
                        >
                            <CreateServerFields form={form} />
                        </Form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button slot="close" variant="secondary">
                            Cancel
                        </Button>
                        <Button
                            form={formId}
                            isDisabled={!form.isSubmittable}
                            isPending={form.isPending}
                            type="submit"
                        >
                            Create Server
                        </Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

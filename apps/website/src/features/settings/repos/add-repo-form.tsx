import { type ComputerAddRepoFolderResult, repoFolderPathSchema } from '@haus/api';
import {
    Button,
    Description,
    FieldError,
    Form,
    Input,
    Label,
    ListBox,
    Modal,
    Select,
    TextField,
} from '@heroui/react';
import { useState } from 'react';
import { useLocalComputerId } from '../../../hooks/repos/use-local-computer-id.ts';
import { useAddRepoFolder } from '../../../hooks/servers/use-computer-repo-folders.ts';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { canPickRepoFolder, pickRepoFolder } from '../../../lib/desktop-repo-folder.ts';
import { SettingsFact, SettingsRowError } from '../layout/settings-text.tsx';
import { type AddableDevice, addableDevices, defaultDeviceId } from './add-repo-devices.ts';
import { RepoFolderDisclosure } from './repo-folder-disclosure.tsx';

const formId = 'add-repo-form';

export function AddRepoForm({
    computerId,
    onAdded,
    onClose,
    serverId,
}: {
    computerId?: string;
    onAdded: (added: ComputerAddRepoFolderResult & { computerId: string }) => void;
    onClose: () => void;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const localComputerId = useLocalComputerId(serverId);
    const devices = addableDevices(computers.data ?? []);
    const [chosenId, setChosenId] = useState<string | null>(null);
    const deviceId = computerId ?? chosenId ?? defaultDeviceId(devices, localComputerId ?? null);
    const device = devices.find((candidate) => candidate.id === deviceId) ?? null;
    const add = useAddRepoFolder();
    const [path, setPath] = useState('');
    const [invalid, setInvalid] = useState<string | null>(null);
    const error = invalid ?? add.error?.message ?? null;
    const picks = device !== null && device.id === localComputerId && canPickRepoFolder();

    const submit = () => {
        if (!device) {
            return;
        }
        const parsed = repoFolderPathSchema.safeParse(path);
        if (!parsed.success) {
            setInvalid('Enter the folder’s full path, starting with /.');
            return;
        }
        add.mutate(
            { computerId: device.id, path: parsed.data, serverId },
            { onSuccess: (added) => onAdded({ ...added, computerId: device.id }) }
        );
    };
    const changePath = (value: string) => {
        setPath(value);
        setInvalid(null);
        add.reset();
    };

    return (
        <>
            <Modal.Header>
                <Modal.Heading>Add repository</Modal.Heading>
                <p>
                    Choose a git checkout on your device. Haus reads the GitHub repo its origin
                    names.
                </p>
            </Modal.Header>
            <Modal.Body>
                <Form
                    className="flex flex-col gap-4"
                    id={formId}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (path.trim().length > 0 && !add.isPending) {
                            submit();
                        }
                    }}
                >
                    {computerId ? null : (
                        <DeviceSelect
                            devices={devices}
                            onChange={(id) => {
                                setChosenId(id);
                                changePath('');
                            }}
                            value={device?.id ?? null}
                        />
                    )}
                    {computers.data && devices.length === 0 ? (
                        <Description>
                            Only the person who attached a device adds its folders. Attach this Mac
                            in Settings → Devices first.
                        </Description>
                    ) : null}
                    {picks ? (
                        <PickedFolder error={error} onPick={changePath} path={path} />
                    ) : (
                        <TextField
                            autoFocus
                            fullWidth
                            isDisabled={!device}
                            isInvalid={error !== null}
                            onChange={changePath}
                            value={path}
                            variant="secondary"
                        >
                            <Label>Folder path</Label>
                            <Input autoComplete="off" placeholder="/Users/you/code/haus" />
                            <FieldError>{error}</FieldError>
                        </TextField>
                    )}
                    <Description>
                        <RepoFolderDisclosure />
                    </Description>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button onPress={onClose} type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form={formId}
                    isDisabled={path.trim().length === 0 || !device?.isOnline}
                    isPending={add.isPending}
                    type="submit"
                >
                    Add repository
                </Button>
            </Modal.Footer>
        </>
    );
}

function DeviceSelect({
    devices,
    onChange,
    value,
}: {
    devices: readonly AddableDevice[];
    onChange: (id: string) => void;
    value: string | null;
}) {
    return (
        <Select
            disabledKeys={devices.filter((device) => !device.isOnline).map((device) => device.id)}
            fullWidth
            isDisabled={devices.length === 0}
            onChange={(key) => {
                if (typeof key === 'string') {
                    onChange(key);
                }
            }}
            value={value}
            variant="secondary"
        >
            <Label>Device</Label>
            <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
                <ListBox>
                    {devices.map((device) => (
                        <ListBox.Item id={device.id} key={device.id} textValue={device.name}>
                            <Label>
                                {device.isOnline ? device.name : `${device.name} (offline)`}
                            </Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </Select.Popover>
        </Select>
    );
}

function PickedFolder({
    error,
    onPick,
    path,
}: {
    error: string | null;
    onPick: (path: string) => void;
    path: string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <Label>Folder</Label>
            <div className="flex min-w-0 items-center gap-3">
                <Button
                    autoFocus
                    onPress={async () => {
                        const picked = await pickRepoFolder();
                        if (picked.status === 'picked') {
                            onPick(picked.path);
                        }
                    }}
                    size="sm"
                    variant="secondary"
                >
                    Choose folder…
                </Button>
                <SettingsFact className="min-w-0 truncate font-mono" title={path}>
                    {path || 'No folder chosen'}
                </SettingsFact>
            </div>
            <SettingsRowError>{error}</SettingsRowError>
        </div>
    );
}

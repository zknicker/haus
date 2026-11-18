import { Description, Label, ListBox, Select } from '@heroui/react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AcceptInvitationPage } from '../../routes/app/accept-invitation-page.tsx';
import { CoveOnboardingRoute } from '../onboarding/cove-onboarding-route.tsx';
import {
    activationPreviewScenes,
    activationScenePath,
    findActivationScene,
    findActivationSceneById,
} from './activation-preview-scenes.tsx';
import { ActivationPreviewServer } from './activation-preview-server.tsx';

/**
 * Design-iteration preview for every activation surface: sign-in, Server
 * choice and creation, invitations, Computer approval, and Cove onboarding.
 * Each scene is the real component fed by fixtures; the URL selects the scene.
 */
export function ActivationPreviewRoute() {
    return (
        <ActivationPreviewServer>
            <ScenePicker />
            <Routes>
                <Route element={<SceneRedirect />} index />
                <Route element={<AcceptInvitationPage />} path="invite/:token" />
                <Route element={<CoveOnboardingRoute />} path="onboarding/:slug" />
                <Route element={<RenderedScene />} path=":sceneId" />
            </Routes>
        </ActivationPreviewServer>
    );
}

function SceneRedirect() {
    return <Navigate replace to={activationScenePath(firstScene())} />;
}

function RenderedScene() {
    const { sceneId = '' } = useParams();
    const scene = findActivationSceneById(sceneId);
    if (!scene?.render) {
        return <SceneRedirect />;
    }
    return scene.render();
}

/** Floating scene switcher; it overlays the scene without joining its layout. */
function ScenePicker() {
    const location = useLocation();
    const navigate = useNavigate();
    const scene = findActivationScene(location.pathname, location.search);

    return (
        <div className="fixed top-3 right-3 z-50 w-72">
            <Select
                aria-label="Activation preview scene"
                fullWidth
                onChange={(value) => {
                    const next = findActivationSceneById(String(value ?? ''));
                    if (next) {
                        navigate(activationScenePath(next));
                    }
                }}
                value={scene?.id ?? ''}
                variant="secondary"
            >
                <Select.Trigger>
                    <Select.Value>
                        {() =>
                            scene ? `${scene.group} · ${sceneLabel(scene.id)}` : 'Pick a scene'
                        }
                    </Select.Value>
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        {activationPreviewScenes.map((option) => (
                            <ListBox.Item id={option.id} key={option.id} textValue={option.id}>
                                <Label>
                                    {option.group} · {sceneLabel(option.id)}
                                </Label>
                                <Description>{option.description}</Description>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
            </Select>
        </div>
    );
}

function sceneLabel(sceneId: string): string {
    return sceneId.replaceAll('-', ' ');
}

function firstScene() {
    const [scene] = activationPreviewScenes;
    if (!scene) {
        throw new Error('The activation preview needs at least one scene.');
    }
    return scene;
}

import { Description, Label, ListBox, Select } from '@heroui/react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { asksPreviewScenes, asksScenePath, findAsksScene } from './asks-preview-scenes.ts';
import { ReviewLooksScene } from './review-looks-scene.tsx';
import { WorkerQuestionScene } from './worker-question-scene.tsx';

export function AsksPreviewRoute() {
    return (
        <Routes>
            <Route element={<SceneRedirect />} index />
            <Route element={<RenderedScene />} path=":sceneId" />
        </Routes>
    );
}

function SceneRedirect() {
    return <Navigate replace to={asksScenePath('worker-question')} />;
}

function RenderedScene() {
    const { sceneId = '' } = useParams();
    const scene = findAsksScene(sceneId);
    if (!scene) {
        return <SceneRedirect />;
    }
    return (
        <>
            {scene.id === 'worker-question' ? <WorkerQuestionScene /> : <ReviewLooksScene />}
            <ScenePicker sceneId={scene.id} />
        </>
    );
}

function ScenePicker({ sceneId }: { sceneId: string }) {
    const navigate = useNavigate();
    const current = findAsksScene(sceneId);
    return (
        <div className="fixed top-3 right-3 z-50">
            <Select
                aria-label="Asks preview scene"
                className="w-64"
                onChange={(value) => {
                    const next = findAsksScene(String(value ?? ''));
                    if (next) {
                        navigate(asksScenePath(next.id));
                    }
                }}
                value={sceneId}
                variant="secondary"
            >
                <Select.Trigger>
                    <Select.Value>{() => current?.title ?? sceneId}</Select.Value>
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        {asksPreviewScenes.map((option) => (
                            <ListBox.Item id={option.id} key={option.id} textValue={option.title}>
                                <Label>{option.title}</Label>
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

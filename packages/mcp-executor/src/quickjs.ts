import { makeQuickJsExecutor, setQuickJSModule } from '@executor-js/runtime-quickjs';
import variant from '@jitl/quickjs-wasmfile-release-sync';
// Bun embeds this asset in the standalone Computer executable.
// @ts-expect-error -- the package exports a WASM asset without a TypeScript declaration.
import wasmPath from '@jitl/quickjs-wasmfile-release-sync/wasm' with { type: 'file' };
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';

export async function createExecutor() {
    const wasmBinary = await Bun.file(wasmPath).arrayBuffer();
    setQuickJSModule(await newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmBinary })));
    return makeQuickJsExecutor({
        maxStackSizeBytes: 1024 * 1024,
        memoryLimitBytes: 64 * 1024 * 1024,
        timeoutMs: 5000,
    });
}

import { skyFragmentShader, skyVertexShader } from './halloween-sky-shader.ts';

/** One frame of the sky, in CSS px; `scale` is backing px per CSS px. */
export interface SkyFrame {
    height: number;
    moon: { radius: number; x: number; y: number };
    scale: number;
    time: number;
    width: number;
}

export interface SkyRenderer {
    dispose(): void;
    draw(frame: SkyFrame): void;
}

const pendingRelease = new WeakMap<HTMLCanvasElement, ReturnType<typeof setTimeout>>();

/**
 * The sky's WebGL1 program on one canvas, or `null` when WebGL is unavailable
 * or the program fails to build — the caller then renders nothing.
 */
export function createSkyRenderer(canvas: HTMLCanvasElement): SkyRenderer | null {
    clearTimeout(pendingRelease.get(canvas));
    pendingRelease.delete(canvas);
    const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        powerPreference: 'low-power',
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        stencil: false,
    });
    if (!gl) {
        return null;
    }
    const program = buildProgram(gl);
    if (!program) {
        loseContext(gl);
        return null;
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // One triangle that covers the viewport.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {
        moon: gl.getUniformLocation(program, 'u_moon'),
        res: gl.getUniformLocation(program, 'u_res'),
        scale: gl.getUniformLocation(program, 'u_scale'),
        size: gl.getUniformLocation(program, 'u_size'),
        time: gl.getUniformLocation(program, 'u_time'),
    };

    return {
        dispose() {
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
            // Released a task later: StrictMode remounts on the same canvas at
            // once, and a released context would come back lost.
            pendingRelease.set(
                canvas,
                setTimeout(() => {
                    pendingRelease.delete(canvas);
                    loseContext(gl);
                }, 0)
            );
        },
        draw(frame) {
            const backingWidth = Math.max(1, Math.round(frame.width * frame.scale));
            const backingHeight = Math.max(1, Math.round(frame.height * frame.scale));
            if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
                canvas.width = backingWidth;
                canvas.height = backingHeight;
            }
            gl.viewport(0, 0, backingWidth, backingHeight);
            gl.uniform2f(uniforms.res, backingWidth, backingHeight);
            gl.uniform1f(uniforms.scale, backingWidth / frame.width);
            gl.uniform2f(uniforms.size, frame.width, frame.height);
            gl.uniform1f(uniforms.time, frame.time);
            gl.uniform3f(uniforms.moon, frame.moon.x, frame.moon.y, frame.moon.radius);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
    };
}

function buildProgram(gl: WebGLRenderingContext): WebGLProgram | null {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, skyVertexShader);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, skyFragmentShader);
    const program = gl.createProgram();
    if (!(vertex && fragment && program)) {
        return null;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    // Linked programs keep their own copy; the shader objects can go.
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('Halloween sky: shader link failed.', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

function compileShader(
    gl: WebGLRenderingContext,
    type: number,
    source: string
): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) {
        return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Halloween sky: shader compile failed.', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

/** Frees the context now rather than waiting for GC; browsers cap live contexts. */
function loseContext(gl: WebGLRenderingContext) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
}

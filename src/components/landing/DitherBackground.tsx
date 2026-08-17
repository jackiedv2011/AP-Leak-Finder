import { useEffect, useRef } from 'react'

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

// Adapted directly from the supplied 21st.dev Paper Design dithering recipe.
const FRAGMENT_SHADER = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_colors[4];

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

vec3 palette(float value) {
  vec3 color = mix(u_colors[0], u_colors[1], smoothstep(0.0, 1.0, clamp(value * 3.0, 0.0, 1.0)));
  color = mix(color, u_colors[2], smoothstep(0.0, 1.0, clamp(value * 3.0 - 1.0, 0.0, 1.0)));
  return mix(color, u_colors[3], smoothstep(0.0, 1.0, clamp(value * 3.0 - 2.0, 0.0, 1.0)));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  p *= 1.26;
  float field = fbm(p * 3.1 + vec2(u_time * 0.08, -u_time * 0.05));
  vec2 pixel = floor(uv * 137.0);
  float threshold = fract(dot(pixel, vec2(0.75487766, 0.56984029)));
  float dithered = floor(field * 3.75 + threshold) / 3.75;
  vec3 color = palette(dithered);
  float highlight = smoothstep(0.66, 0.94, dithered);
  float keepHighlight = step(0.32, hash(pixel + vec2(19.7, 5.4)));
  color = mix(color, u_colors[2], highlight * (1.0 - keepHighlight));
  float greenAccent = smoothstep(0.44, 0.78, field) * step(0.88, hash(pixel + vec2(7.1, 31.8)));
  color = mix(color, vec3(0.29, 0.68, 0.43), greenAccent * 0.46);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

const RECLAIM_COLORS = new Float32Array([
  0.043, 0.043, 0.047, // #0b0b0c
  0.204, 0.227, 0.251, // #343a40
  0.678, 0.710, 0.741, // #adb5bd
  0.973, 0.976, 0.980, // #f8f9fa
])

const RECLAIM_LIGHT_COLORS = new Float32Array([
  0.800, 0.776, 0.722, // #ccc6b8
  0.875, 0.851, 0.800, // #dfd9cc
  0.929, 0.910, 0.867, // #ede8dd
  0.973, 0.961, 0.929, // #f8f5ed
])

const pendingContextReleases = new WeakMap<HTMLCanvasElement, number>()

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

/** Reclaim's hero-only adaptation of the supplied 21st.dev dithering shader. */
export function DitherBackground({ className = '', tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pendingRelease = pendingContextReleases.get(canvas)
    if (pendingRelease !== undefined) window.clearTimeout(pendingRelease)
    pendingContextReleases.delete(canvas)
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' })
    if (!gl) return

    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    const program = gl.createProgram()
    if (!vertex || !fragment || !program) {
      if (vertex) gl.deleteShader(vertex)
      if (fragment) gl.deleteShader(fragment)
      if (program) gl.deleteProgram(program)
      return
    }

    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return
    }

    gl.useProgram(program)
    const buffer = gl.createBuffer()
    const position = gl.getAttribLocation(program, 'a_position')
    const resolution = gl.getUniformLocation(program, 'u_resolution')
    const time = gl.getUniformLocation(program, 'u_time')
    const colors = gl.getUniformLocation(program, 'u_colors[0]')
    if (!buffer || position < 0 || !resolution || !time || !colors) {
      if (buffer) gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      return
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.uniform3fv(colors, tone === 'light' ? RECLAIM_LIGHT_COLORS : RECLAIM_COLORS)

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = document.visibilityState === 'visible'
    let inView = true
    let frame = 0
    let disposed = false
    const start = performance.now()

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const rawWidth = Math.max(1, Math.round(bounds.width * dpr))
      const rawHeight = Math.max(1, Math.round(bounds.height * dpr))
      const scale = Math.min(1, Math.sqrt(1_300_000 / (rawWidth * rawHeight)))
      const width = Math.max(1, Math.round(rawWidth * scale))
      const height = Math.max(1, Math.round(rawHeight * scale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    const render = (now: number) => {
      frame = 0
      if (disposed || !visible || !inView) return
      resize()
      gl.uniform2f(resolution, canvas.width, canvas.height)
      gl.uniform1f(time, motionQuery.matches ? 0 : (now - start) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!motionQuery.matches) frame = window.requestAnimationFrame(render)
    }
    const requestRender = () => {
      if (!disposed && visible && inView && frame === 0) frame = window.requestAnimationFrame(render)
    }
    const handleVisibility = () => {
      visible = document.visibilityState === 'visible'
      if (visible) requestRender()
    }
    const handleMotionChange = () => requestRender()

    const resizeObserver = new ResizeObserver(requestRender)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true
      if (inView) requestRender()
      else if (frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
    })
    resizeObserver.observe(canvas)
    intersectionObserver.observe(canvas)
    document.addEventListener('visibilitychange', handleVisibility)
    motionQuery.addEventListener('change', handleMotionChange)
    requestRender()

    return () => {
      disposed = true
      if (frame) window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
      motionQuery.removeEventListener('change', handleMotionChange)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      const releaseTimer = window.setTimeout(() => {
        if (pendingContextReleases.get(canvas) !== releaseTimer) return
        pendingContextReleases.delete(canvas)
        gl.getExtension('WEBGL_lose_context')?.loseContext()
        canvas.width = 1
        canvas.height = 1
      }, 0)
      pendingContextReleases.set(canvas, releaseTimer)
    }
  }, [tone])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

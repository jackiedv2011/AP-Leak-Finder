import { useEffect, useRef } from 'react'

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

// Adapted from the supplied 21st.dev Paper Design dithering recipe. The animated
// grain shows through everywhere; a single "RECLAIM" wordmark is blended into it
// (brightened, not cut out) and scrolls right-to-left, looping seamlessly.
const FRAGMENT_SHADER = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_colors[4];
uniform sampler2D u_mask;
uniform float u_periodPx;
uniform float u_scrollPx;

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

  float maskU = (gl_FragCoord.x + u_scrollPx) / u_periodPx;
  float maskV = 1.0 - uv.y;
  float letter = texture2D(u_mask, vec2(maskU, maskV)).r;

  // Bevel: a light source from the upper-left. Sampling the mask a few texels
  // toward vs. away from that light and comparing to the center gives a bright
  // rim on the lit edge and a dark rim on the shadowed edge — an embossed look.
  vec2 offs = vec2(4.0 / 2048.0, 4.0 / 512.0);
  float mHi = texture2D(u_mask, vec2(maskU, maskV) - offs).r;
  float mSh = texture2D(u_mask, vec2(maskU, maskV) + offs).r;
  float highlightEdge = clamp(letter - mHi, 0.0, 1.0);
  float shadowEdge = clamp(letter - mSh, 0.0, 1.0);

  color = mix(color, vec3(0.0), letter * 0.55);
  color = mix(color, vec3(0.0), shadowEdge * 0.4);
  color = mix(color, u_colors[3], highlightEdge * 0.95);

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

const WORD_TEXTURE_WIDTH = 2048
const WORD_TEXTURE_HEIGHT = 512

/**
 * Draws "RECLAIM" once, tightly kerned, into a power-of-two texture. The blank
 * remainder of the texture is the gap a single word travels through before the
 * next copy enters — GL's REPEAT wrap turns that into a seamless scrolling loop.
 * Cached at module scope: the artwork itself doesn't depend on container size.
 */
let cachedWordTexture: { data: Uint8Array; wordFraction: number } | null = null

function buildWordTexture() {
  if (cachedWordTexture) return cachedWordTexture

  const canvas = document.createElement('canvas')
  canvas.width = WORD_TEXTURE_WIDTH
  canvas.height = WORD_TEXTURE_HEIGHT
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    cachedWordTexture = { data: new Uint8Array(WORD_TEXTURE_WIDTH * WORD_TEXTURE_HEIGHT).fill(255), wordFraction: 1 }
    return cachedWordTexture
  }

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, WORD_TEXTURE_WIDTH, WORD_TEXTURE_HEIGHT)
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'

  const word = 'RECLAIM'
  const fontSize = WORD_TEXTURE_HEIGHT * 0.62
  const charAdvanceFactor = 0.98 // a little breathing room between letters, but still reads as one word
  const inset = WORD_TEXTURE_HEIGHT * 0.18
  ctx.font = `900 ${fontSize}px Arial, "Helvetica Neue", Helvetica, sans-serif`
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = fontSize * 0.1 // faux-bold: stroke widens the glyphs beyond the font's own 900 weight

  const baselineY = WORD_TEXTURE_HEIGHT / 2 + fontSize * 0.36
  let x = inset
  for (const ch of word) {
    ctx.strokeText(ch, x, baselineY)
    ctx.fillText(ch, x, baselineY)
    x += ctx.measureText(ch).width * charAdvanceFactor
  }
  const wordWidth = x + inset

  const image = ctx.getImageData(0, 0, WORD_TEXTURE_WIDTH, WORD_TEXTURE_HEIGHT).data
  const data = new Uint8Array(WORD_TEXTURE_WIDTH * WORD_TEXTURE_HEIGHT)
  for (let i = 0; i < data.length; i += 1) data[i] = image[i * 4]

  cachedWordTexture = { data, wordFraction: Math.min(0.98, wordWidth / WORD_TEXTURE_WIDTH) }
  return cachedWordTexture
}

/** Reclaim's hero-only adaptation of the supplied 21st.dev dithering shader, blended with the word "RECLAIM" scrolling across. */
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
    const maskUniform = gl.getUniformLocation(program, 'u_mask')
    const periodUniform = gl.getUniformLocation(program, 'u_periodPx')
    const scrollUniform = gl.getUniformLocation(program, 'u_scrollPx')
    const maskTexture = gl.createTexture()
    if (!buffer || position < 0 || !resolution || !time || !colors || !maskUniform || !periodUniform || !scrollUniform || !maskTexture) {
      if (buffer) gl.deleteBuffer(buffer)
      if (maskTexture) gl.deleteTexture(maskTexture)
      gl.deleteProgram(program)
      return
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.uniform3fv(colors, tone === 'light' ? RECLAIM_LIGHT_COLORS : RECLAIM_COLORS)

    const word = buildWordTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, maskTexture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, WORD_TEXTURE_WIDTH, WORD_TEXTURE_HEIGHT, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, word.data)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.uniform1i(maskUniform, 0)

    const scrollSpeedPxPerSec = 130

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = document.visibilityState === 'visible'
    let inView = true
    let frame = 0
    let disposed = false
    let periodPx = 1
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
      // One period = one canvas width, so exactly one tile is ever on screen (no
      // repeated copies). The gap is whatever's left after the word's own width,
      // so a bigger/wider word naturally leaves a shorter pause before the next one.
      periodPx = canvas.width
    }

    const render = (now: number) => {
      frame = 0
      if (disposed || !visible || !inView) return
      resize()
      const elapsed = motionQuery.matches ? 0 : (now - start) / 1000
      gl.uniform2f(resolution, canvas.width, canvas.height)
      gl.uniform1f(time, elapsed)
      gl.uniform1f(periodUniform, periodPx)
      gl.uniform1f(scrollUniform, (elapsed * scrollSpeedPxPerSec) % periodPx)
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
      gl.deleteTexture(maskTexture)
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

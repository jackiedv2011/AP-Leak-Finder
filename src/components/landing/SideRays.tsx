import { useEffect, useRef, useState } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import './side-rays.css'

type SideRaysProps = {
  speed?: number
  rayColor1?: string
  rayColor2?: string
  intensity?: number
  spread?: number
  origin?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  tilt?: number
  saturation?: number
  blend?: number
  falloff?: number
  opacity?: number
  className?: string
}

const hexToRgb = (hex: string): [number, number, number] => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return match
    ? [parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255]
    : [1, 1, 1]
}

const originToFlip = (origin: NonNullable<SideRaysProps['origin']>): [number, number] => {
  switch (origin) {
    case 'top-left': return [1, 0]
    case 'bottom-right': return [0, 1]
    case 'bottom-left': return [1, 1]
    default: return [0, 0]
  }
}

/** A viewport-aware, canvas-based ambient ray layer. */
export function SideRays({
  speed = 1,
  rayColor1 = '#ffffff',
  rayColor2 = '#79d99b',
  intensity = 1,
  spread = 1,
  origin = 'bottom-right',
  tilt = -6,
  saturation = 1.05,
  blend = 0.6,
  falloff = 2.5,
  opacity = 1,
  className = '',
}: SideRaysProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!visible || !container) return

    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), alpha: true })
    const { gl } = renderer
    const canvas = gl.canvas
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0

    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.setAttribute('aria-hidden', 'true')
    container.replaceChildren(canvas)

    const vertex = `
      attribute vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }
    `

    const fragment = `
      precision highp float;
      uniform float iTime;
      uniform vec2 iResolution;
      uniform float iSpeed;
      uniform vec3 iRayColor1;
      uniform vec3 iRayColor2;
      uniform float iIntensity;
      uniform float iSpread;
      uniform float iFlipX;
      uniform float iFlipY;
      uniform float iTilt;
      uniform float iSaturation;
      uniform float iBlend;
      uniform float iFalloff;
      uniform float iOpacity;

      float rayStrength(vec2 source, vec2 direction, vec2 coordinate, float seedA, float seedB, float speed) {
        vec2 sourceToCoordinate = coordinate - source;
        float cosine = dot(normalize(sourceToCoordinate), direction);
        return clamp((0.45 + 0.15 * sin(cosine * seedA + iTime * speed)) + (0.3 + 0.2 * cos(-cosine * seedB + iTime * speed)), 0.0, 1.0)
          * clamp((iResolution.x - length(sourceToCoordinate)) / iResolution.x, 0.5, 1.0);
      }

      void main() {
        vec2 fragmentCoordinate = gl_FragCoord.xy;
        if (iFlipX > 0.5) fragmentCoordinate.x = iResolution.x - fragmentCoordinate.x;
        if (iFlipY > 0.5) fragmentCoordinate.y = iResolution.y - fragmentCoordinate.y;
        vec2 coordinate = vec2(fragmentCoordinate.x, iResolution.y - fragmentCoordinate.y);
        vec2 source = vec2(iResolution.x * 1.1, -0.5 * iResolution.y);
        float radians = iTilt * 3.14159265 / 180.0;
        vec2 relative = coordinate - source;
        vec2 tilted = vec2(relative.x * cos(radians) - relative.y * sin(radians), relative.x * sin(radians) + relative.y * cos(radians)) + source;
        float halfSpread = iSpread * 0.275;
        vec2 firstDirection = normalize(vec2(cos(0.785398 + halfSpread), sin(0.785398 + halfSpread)));
        vec2 secondDirection = normalize(vec2(cos(0.785398 - halfSpread), sin(0.785398 - halfSpread)));
        vec4 firstRay = vec4(iRayColor1, 1.0) * rayStrength(source, firstDirection, tilted, 36.2214, 21.11349, iSpeed);
        vec4 secondRay = vec4(iRayColor2, 1.0) * rayStrength(source, secondDirection, tilted, 22.3991, 18.0234, iSpeed * 0.2);
        vec4 color = firstRay * (1.0 - iBlend) * 0.9 + secondRay * iBlend * 0.9;
        float distanceToLight = length(fragmentCoordinate - vec2(source.x, iResolution.y - source.y)) / iResolution.y;
        color.rgb *= iIntensity * 0.4 / pow(max(distanceToLight, 0.001), iFalloff);
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(vec3(gray), color.rgb, iSaturation);
        color.a = max(color.r, max(color.g, color.b)) * iOpacity;
        gl_FragColor = color;
      }
    `

    const [flipX, flipY] = originToFlip(origin)
    const uniforms = {
      iTime: { value: 0 }, iResolution: { value: [1, 1] }, iSpeed: { value: speed },
      iRayColor1: { value: hexToRgb(rayColor1) }, iRayColor2: { value: hexToRgb(rayColor2) },
      iIntensity: { value: intensity }, iSpread: { value: spread }, iFlipX: { value: flipX }, iFlipY: { value: flipY },
      iTilt: { value: tilt }, iSaturation: { value: saturation }, iBlend: { value: blend },
      iFalloff: { value: falloff }, iOpacity: { value: opacity },
    }
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program: new Program(gl, { vertex, fragment, uniforms }) })

    const resize = () => {
      renderer.dpr = Math.min(window.devicePixelRatio, 2)
      renderer.setSize(container.clientWidth, container.clientHeight)
      uniforms.iResolution.value = [container.clientWidth * renderer.dpr, container.clientHeight * renderer.dpr]
    }
    const render = (time: number) => {
      uniforms.iTime.value = reducedMotion ? 0 : time * 0.001
      renderer.render({ scene: mesh })
      if (!reducedMotion) frame = requestAnimationFrame(render)
    }

    resize()
    render(0)
    if (!reducedMotion) frame = requestAnimationFrame(render)
    window.addEventListener('resize', resize)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      container.replaceChildren()
    }
  }, [blend, falloff, intensity, opacity, origin, rayColor1, rayColor2, saturation, speed, spread, tilt, visible])

  return <div ref={containerRef} className={`side-rays-container ${className}`.trim()} aria-hidden="true" />
}

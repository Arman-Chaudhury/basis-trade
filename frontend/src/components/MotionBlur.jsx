import React, { forwardRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Effect } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

/* Directional motion blur, after topology.vc's post pass: 29 taps along one direction with triangle weights,
   then exposure, shadow lift, a bottom fade and film grain. Distance (in texels) is driven by scroll speed. */
const FRAG = /* glsl */`
uniform float uAngle;
uniform float uDistance;
uniform float uExposure;
uniform float uShadowLift;
uniform float uNoise;
uniform float uBottomFade;
uniform float uTime;
uniform vec2 uResolution;
const int SAMPLES = 29;
float rnd(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 443.8975); p3 += dot(p3, p3.yzx + 19.19); return fract((p3.x + p3.y) * p3.z); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec4 color;
  if (uDistance > 0.05) {
    vec2 dir = vec2(cos(uAngle), sin(uAngle));
    vec2 stepUv = dir * uDistance / uResolution;
    vec4 acc = vec4(0.0); float wsum = 0.0;
    for (int i = 0; i < SAMPLES; i++) {
      float t = float(i) / float(SAMPLES - 1) - 0.5;
      float w = 1.0 - abs(t * 2.0);
      acc += texture2D(inputBuffer, clamp(uv + stepUv * t, 0.0, 1.0)) * w; wsum += w;
    }
    color = acc / wsum;
  } else color = inputColor;
  color.rgb = mix(vec3(uShadowLift), vec3(1.0), color.rgb) * uExposure;
  float fade = smoothstep(0.0, 0.22, uv.y);
  color.rgb *= mix(1.0 - uBottomFade, 1.0, fade);
  color.rgb += (rnd(uv + fract(uTime)) - 0.5) * uNoise;
  outputColor = vec4(color.rgb, inputColor.a);
}`

class MotionBlurEffect extends Effect {
  constructor() {
    super('MotionBlurEffect', FRAG, { uniforms: new Map([
      ['uAngle', new Uniform(Math.PI / 2)], ['uDistance', new Uniform(4)], ['uExposure', new Uniform(0.97)], ['uShadowLift', new Uniform(0.0)],
      ['uNoise', new Uniform(0.07)], ['uBottomFade', new Uniform(0.08)], ['uTime', new Uniform(0)], ['uResolution', new Uniform(new Vector2(1, 1))],
    ]) })
  }
}

/* `speed` is a ref: { value } in levels/s (flow + boost) from the terrain; blur distance follows it. */
export const MotionBlur = forwardRef(function MotionBlur({ speed, base = 1.2, gain = 30, dark = false }, ref) {
  const effect = useMemo(() => new MotionBlurEffect(), [])
  const { size, viewport } = useThree()
  useFrame((_, dt) => {
    const u = effect.uniforms
    u.get('uResolution').value.set(size.width * viewport.dpr, size.height * viewport.dpr)
    u.get('uTime').value += dt
    u.get('uExposure').value = dark ? 1.05 : 0.97; u.get('uBottomFade').value = dark ? 0.18 : 0.08; u.get('uNoise').value = dark ? 0.028 : 0.07
    const target = base + Math.max(0, (speed?.current ?? 0) - 1.0) * gain
    const cur = u.get('uDistance').value
    u.get('uDistance').value = cur + (target - cur) * (1 - Math.exp(-dt * 6))
  })
  return <primitive ref={ref} object={effect} />
})

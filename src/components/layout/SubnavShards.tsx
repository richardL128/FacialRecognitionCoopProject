'use client';

import { useEffect, useMemo, useRef } from 'react';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function lerp(min: number, max: number, factor: number): number {
  return min + (max - min) * factor;
}

/* ── Shard type ──────────────────────────────────────────────────────────── */

interface Shard {
  left: string;
  top: string;
  width: string;
  height: string;
  background: string;
  baseOpacity: number;
  zIndex: number;
  className: string;
  durationMs: number;
  phaseMs: number;
  driftX: number;
  driftY: number;
  baseAngle: number;
  angleRange: number;
  baseScale: number;
}

/* ── Colour palette ──────────────────────────────────────────────────────── */

const palette = [
  ['rgba(148, 215, 252, 0.44)', 'rgba(34, 133, 208, 0.1)'],
  ['rgba(237, 248, 255, 0.48)', 'rgba(92, 181, 239, 0.16)'],
  ['rgba(35, 143, 220, 0.34)', 'rgba(0, 69, 104, 0.12)'],
  ['rgba(255, 255, 255, 0.28)', 'rgba(125, 202, 248, 0.1)'],
  ['rgba(73, 164, 235, 0.28)', 'rgba(8, 81, 123, 0.12)'],
  ['rgba(234, 246, 255, 0.36)', 'rgba(34, 133, 208, 0.1)'],
  ['rgba(34, 133, 208, 0.26)', 'rgba(0, 102, 155, 0.1)'],
  ['rgba(16, 96, 147, 0.28)', 'rgba(148, 215, 252, 0.11)'],
] as const;

/* ── Component ───────────────────────────────────────────────────────────── */

export default function SubnavShards() {
  const refs = useRef<Array<HTMLDivElement | null>>([]);

  const shards = useMemo<Shard[]>(() => {
    const count = 14;
    const result: Shard[] = [];

    for (let index = 0; index < count; index++) {
      const sizeSeed = seededUnit(index + 1);
      const tallSeed = seededUnit(index + 21);
      const angleSeed = seededUnit(index + 41);
      const directionSeed = seededUnit(index + 61);
      const opacitySeed = seededUnit(index + 81);
      const phaseSeed = seededUnit(index + 101);

      const front = index % 3 !== 0;
      const giant = index % 5 === 0;

      const pair = palette[index % palette.length]!;
      const [startColor, endColor] = pair;

      let width: number;
      let height: number;

      if (giant) {
        width = lerp(34, 58, sizeSeed);
        height = lerp(185, 290, tallSeed);
      } else if (front) {
        width = lerp(8, 24, sizeSeed);
        height = lerp(104, 164, tallSeed);
      } else {
        width = lerp(14, 36, sizeSeed);
        height = lerp(126, 228, tallSeed);
      }

      result.push({
        left: `${giant ? lerp(-24, 82, seededUnit(index + 121)) : lerp(-12, 98, index / (count - 1))}%`,
        top: `${giant ? lerp(-92, -28, seededUnit(index + 161)) : lerp(-42, -6, seededUnit(index + 161))}%`,
        width: `${width}%`,
        height: `${height}%`,
        background: `linear-gradient(${Math.round(lerp(128, 156, seededUnit(index + 181)))}deg, ${startColor}, ${endColor})`,
        baseOpacity: lerp(front ? 0.66 : 0.5, front ? 0.9 : 0.72, opacitySeed),
        zIndex: front ? 5 + (index % 4) : 1 + (index % 3),
        className: `pe-subnav__triangle ${front ? 'pe-subnav__triangle--front' : 'pe-subnav__triangle--back'}`,
        durationMs: Math.round(lerp(41400, 77400, seededUnit(index + 201))),
        phaseMs: Math.round(lerp(0, 22000, phaseSeed)),
        driftX: giant ? lerp(18, 44, directionSeed) : lerp(18, 40, directionSeed),
        driftY: giant ? lerp(2, 7, angleSeed) : lerp(2, 8, angleSeed),
        baseAngle: lerp(-62, 58, seededUnit(index + 221)),
        angleRange: lerp(4, 14, seededUnit(index + 241)),
        baseScale: giant ? lerp(0.98, 1.14, sizeSeed) : lerp(0.92, 1.08, sizeSeed),
      });
    }

    return result;
  }, []);

  useEffect(() => {
    let frameId: number;

    function animate(time: number) {
      for (let i = 0; i < shards.length; i++) {
        const node = refs.current[i];
        if (!node) continue;

        const shard = shards[i];
        if (!shard) continue;
        const progress =
          ((time + shard.phaseMs) % shard.durationMs) / shard.durationMs;

        const primaryWave = Math.sin(progress * Math.PI * 2);
        const secondaryWave = Math.cos(progress * Math.PI * 1.4);

        // Fade envelope — smoothstep at edges
        const fadeWindow = 0.16;
        let fadeEnvelope = 1;
        if (progress < fadeWindow) {
          const t = progress / fadeWindow;
          fadeEnvelope = t * t * (3 - 2 * t);
        } else if (progress > 1 - fadeWindow) {
          const t = (1 - progress) / fadeWindow;
          fadeEnvelope = t * t * (3 - 2 * t);
        }

        const translateX = primaryWave * shard.driftX;
        const translateY = secondaryWave * shard.driftY;
        const angle = shard.baseAngle + secondaryWave * shard.angleRange;
        const scale =
          shard.baseScale + Math.sin(progress * Math.PI * 1.6) * 0.025;
        const opacityPulse =
          shard.baseOpacity + Math.cos(progress * Math.PI * 2.2) * 0.06;
        const opacity = Math.max(
          0.35,
          Math.min(0.92, opacityPulse * lerp(0.18, 1, fadeEnvelope)),
        );

        node.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) rotate(${angle}deg) scale(${scale})`;
        node.style.opacity = String(opacity);
      }

      frameId = requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [shards]);

  return (
    <div className="pe-subnav__shards" aria-hidden="true">
      {shards.map((shard, i) => (
        <div
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={shard.className}
          style={{
            left: shard.left,
            top: shard.top,
            width: shard.width,
            height: shard.height,
            background: shard.background,
            opacity: shard.baseOpacity,
            zIndex: shard.zIndex,
            transform: `rotate(${shard.baseAngle}deg) scale(${shard.baseScale})`,
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  );
}

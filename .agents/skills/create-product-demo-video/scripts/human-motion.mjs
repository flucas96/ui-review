#!/usr/bin/env node

import { fileURLToPath } from "node:url";

/**
 * Generate reproducible, human-paced pointer paths and typing timelines.
 */

const DEFAULT_SEED = 1_907_041;

/**
 * Create a deterministic pseudo-random number generator.
 *
 * @param {number} seed
 * @returns {() => number}
 */
export function createRandom(seed = DEFAULT_SEED) {
  let state = Math.trunc(seed) || DEFAULT_SEED;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

/**
 * Plan a smooth pointer path with a curved approach and final correction.
 *
 * @param {{
 *   start: {x: number, y: number},
 *   end: {x: number, y: number},
 *   targetWidth?: number,
 *   targetHeight?: number,
 *   seed?: number,
 *   speed?: number
 * }} options
 * @returns {{
 *   durationMs: number,
 *   preClickPauseMs: number,
 *   postClickPauseMs: number,
 *   keyframes: Array<{offset: number, x: number, y: number}>
 * }}
 */
export function planPointerMotion(options) {
  const {
    start,
    end,
    targetWidth = 80,
    targetHeight = 36,
    seed = DEFAULT_SEED,
    speed = 1,
  } = options;
  assertPoint(start, "start");
  assertPoint(end, "end");
  if (!(speed > 0)) {
    throw new Error("speed must be greater than zero");
  }

  const random = createRandom(seed);
  const delta = { x: end.x - start.x, y: end.y - start.y };
  const distance = Math.hypot(delta.x, delta.y);
  const direction = distance === 0
    ? { x: 1, y: 0 }
    : { x: delta.x / distance, y: delta.y / distance };
  const normal = { x: -direction.y, y: direction.x };
  const targetSize = Math.max(12, Math.min(targetWidth, targetHeight));
  const difficulty = Math.log2(distance / targetSize + 1);
  const variation = 0.9 + random() * 0.22;
  const durationMs = Math.round(clamp((390 + difficulty * 205) * variation / speed, 450, 1_600));
  const bendDirection = random() < 0.5 ? -1 : 1;
  const bend = bendDirection * clamp(distance * (0.055 + random() * 0.06), 8, 68);
  const controlOne = add(start, scale(delta, 0.25 + random() * 0.08), scale(normal, bend));
  const controlTwo = add(start, scale(delta, 0.69 + random() * 0.09), scale(normal, bend * 0.48));
  const overshootDistance = distance > 110 ? 2 + random() * 5 : 0;
  const overshoot = add(
    end,
    scale(direction, overshootDistance),
    scale(normal, (random() - 0.5) * 3),
  );
  const curveEndOffset = overshootDistance > 0 ? 0.88 : 1;
  const keyframes = [];

  for (let index = 0; index <= 8; index += 1) {
    const progress = index / 8;
    const point = cubicBezier(start, controlOne, controlTwo, overshoot, progress);
    keyframes.push({
      offset: round(progress * curveEndOffset, 4),
      x: round(point.x, 2),
      y: round(point.y, 2),
    });
  }
  if (overshootDistance > 0) {
    keyframes.push({ offset: 1, x: round(end.x, 2), y: round(end.y, 2) });
  }

  return {
    durationMs,
    preClickPauseMs: Math.round(90 + random() * 130),
    postClickPauseMs: Math.round(140 + random() * 210),
    keyframes,
  };
}

/**
 * Build a per-character typing timeline with natural pauses.
 *
 * @param {string} text
 * @param {{seed?: number, pace?: number}} [options]
 * @returns {Array<{character: string, delayMs: number}>}
 */
export function planTyping(text, options = {}) {
  const { seed = DEFAULT_SEED, pace = 1 } = options;
  if (!(pace > 0)) {
    throw new Error("pace must be greater than zero");
  }
  const random = createRandom(seed);
  return [...text].map((character, index) => {
    let delay = 45 + random() * 70;
    if (character === " ") {
      delay = 70 + random() * 80;
    } else if (/[.,;:!?]/u.test(character)) {
      delay = 130 + random() * 150;
    } else if (character === "\n") {
      delay = 220 + random() * 280;
    }
    const previousWordLength = wordLengthBefore(text, index);
    if (character === " " && previousWordLength >= 7 && random() > 0.72) {
      delay += 180 + random() * 270;
    }
    return { character, delayMs: Math.round(delay / pace) };
  });
}

/**
 * Plan a continuous camera pan and zoom with minimum-jerk easing.
 *
 * @param {{
 *   from: {x: number, y: number, scale: number},
 *   to: {x: number, y: number, scale: number},
 *   durationMs?: number,
 *   samples?: number
 * }} options
 * @returns {{
 *   durationMs: number,
 *   easing: "linear",
 *   keyframes: Array<{offset: number, x: number, y: number, scale: number}>
 * }}
 */
export function planCameraMotion(options) {
  const { from, to, durationMs = 900, samples = 16 } = options;
  assertCameraState(from, "from");
  assertCameraState(to, "to");
  if (!(durationMs >= 300)) {
    throw new Error("durationMs must be at least 300");
  }
  if (!Number.isInteger(samples) || samples < 4 || samples > 120) {
    throw new Error("samples must be an integer between 4 and 120");
  }

  const keyframes = Array.from({ length: samples + 1 }, (_, index) => {
    const offset = index / samples;
    const progress = minimumJerk(offset);
    return {
      offset: round(offset, 4),
      x: round(lerp(from.x, to.x, progress), 3),
      y: round(lerp(from.y, to.y, progress), 3),
      scale: round(lerp(from.scale, to.scale, progress), 5),
    };
  });
  return { durationMs, easing: "linear", keyframes };
}

/**
 * Return CSS for a pointer, click ripple, and focused blinking caret.
 *
 * @returns {string}
 */
export function interactionCss() {
  return `
.demo-pointer {
  filter: drop-shadow(0 3px 5px rgb(12 12 18 / 28%));
  left: 0;
  pointer-events: none;
  position: fixed;
  top: 0;
  transform-origin: 2px 2px;
  z-index: 2147483647;
}
.demo-pointer-shape {
  transform-origin: 2px 2px;
  transition: transform 90ms ease-out;
}
.demo-pointer.is-pressed .demo-pointer-shape { transform: scale(.91) rotate(-1deg); }
.demo-pointer-ripple {
  animation: demo-pointer-ripple 420ms ease-out both;
  border: 2px solid rgb(120 104 255 / 78%);
  border-radius: 50%;
  height: 14px;
  left: -5px;
  position: absolute;
  top: -5px;
  width: 14px;
}
.demo-focused-caret::after {
  animation: demo-caret-blink 620ms step-end infinite;
  background: currentColor;
  content: "";
  display: inline-block;
  height: 1.08em;
  margin-left: 2px;
  vertical-align: -.16em;
  width: 2px;
}
@keyframes demo-pointer-ripple {
  from { opacity: .95; transform: scale(.3); }
  to { opacity: 0; transform: scale(2.7); }
}
@keyframes demo-caret-blink {
  0%, 48% { opacity: 1; }
  49%, 100% { opacity: 0; }
}`;
}

function cubicBezier(start, controlOne, controlTwo, end, progress) {
  const inverse = 1 - progress;
  return {
    x:
      inverse ** 3 * start.x
      + 3 * inverse ** 2 * progress * controlOne.x
      + 3 * inverse * progress ** 2 * controlTwo.x
      + progress ** 3 * end.x,
    y:
      inverse ** 3 * start.y
      + 3 * inverse ** 2 * progress * controlOne.y
      + 3 * inverse * progress ** 2 * controlTwo.y
      + progress ** 3 * end.y,
  };
}

function add(...points) {
  return points.reduce(
    (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
    { x: 0, y: 0 },
  );
}

function scale(point, multiplier) {
  return { x: point.x * multiplier, y: point.y * multiplier };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function minimumJerk(progress) {
  return 10 * progress ** 3 - 15 * progress ** 4 + 6 * progress ** 5;
}

function round(value, precision) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function assertPoint(point, label) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    throw new Error(`${label} must contain finite x and y coordinates`);
  }
}

function assertCameraState(state, label) {
  assertPoint(state, label);
  if (!Number.isFinite(state?.scale) || !(state.scale > 0)) {
    throw new Error(`${label} must contain a positive finite scale`);
  }
}

function wordLengthBefore(text, index) {
  const match = text.slice(0, index).match(/[^\s]+$/u);
  return match?.[0].length ?? 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pointer = planPointerMotion({
    start: { x: 920, y: 780 },
    end: { x: 318, y: 412 },
    targetWidth: 148,
    targetHeight: 44,
    seed: 42,
  });
  const typing = planTyping("Make the primary action clearer.", { seed: 42 });
  const camera = planCameraMotion({
    from: { x: 0, y: 0, scale: 1 },
    to: { x: -42, y: -18, scale: 1.06 },
  });
  process.stdout.write(`${JSON.stringify({ camera, pointer, typing }, null, 2)}\n`);
}

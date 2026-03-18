import type { NWVVFXKeyframe } from '@nodeweaver/engine';

// ------------------------------------------------------------
// VFX State
// ------------------------------------------------------------

export interface VFXState {
  blur: number;        // px, default 0
  brightness: number;  // 0–2, default 1
  saturation: number;  // 0–2, default 1
  contrast: number;    // 0–2, default 1
  textOpacity: number; // 0–1, default 1
  tint: string | null; // hex color or null
  tintOpacity: number; // 0–0.6
  vignette: number;    // 0–1 darkness amount
  shakeX: number;      // px
  shakeY: number;      // px
}

export function defaultVFXState(): VFXState {
  return {
    blur: 0,
    brightness: 1,
    saturation: 1,
    contrast: 1,
    textOpacity: 1,
    tint: null,
    tintOpacity: 0,
    vignette: 0,
    shakeX: 0,
    shakeY: 0,
  };
}

// ------------------------------------------------------------
// Keyframe interpolation
// ------------------------------------------------------------

/** Parse hex color (#rrggbb or #rgb) to { r, g, b } */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Given a sorted list of keyframes for a single effect type,
 * compute the interpolated numeric value at `currentMs`.
 */
function interpolateNumeric(
  frames: NWVVFXKeyframe[],
  currentMs: number,
  defaultVal: number,
): number {
  if (frames.length === 0) return defaultVal;

  // Find last frame at or before currentMs
  let fromIdx = -1;
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].timeMs <= currentMs) { fromIdx = i; break; }
  }
  if (fromIdx === -1) return defaultVal; // before first keyframe

  const from = frames[fromIdx];
  const fromVal = typeof from.value === 'number' ? from.value : defaultVal;

  // Check if there's a next keyframe to transition into
  const toIdx = fromIdx + 1;
  if (toIdx >= frames.length) return fromVal;

  const to = frames[toIdx];
  const toVal = typeof to.value === 'number' ? to.value : fromVal;
  const transMs = to.transitionMs > 0 ? to.transitionMs : 0;

  if (transMs === 0) return currentMs >= to.timeMs ? toVal : fromVal;

  // Interpolate during the transition window (leading up to `to.timeMs`)
  const transStart = to.timeMs - transMs;
  if (currentMs < transStart) return fromVal;
  if (currentMs >= to.timeMs) return toVal;

  const t = (currentMs - transStart) / transMs;
  return lerp(fromVal, toVal, t);
}

// ------------------------------------------------------------
// computeVFXState
// ------------------------------------------------------------

export function computeVFXState(
  keyframes: NWVVFXKeyframe[],
  currentMs: number,
): VFXState {
  const state = defaultVFXState();
  if (!keyframes || keyframes.length === 0) return state;

  // Group by effect type
  const groups: Partial<Record<string, NWVVFXKeyframe[]>> = {};
  for (const kf of keyframes) {
    if (!groups[kf.effect]) groups[kf.effect] = [];
    groups[kf.effect]!.push(kf);
  }
  // Sort each group by timeMs
  for (const key of Object.keys(groups)) {
    groups[key]!.sort((a, b) => a.timeMs - b.timeMs);
  }

  const get = (effect: string, def: number) =>
    interpolateNumeric(groups[effect] ?? [], currentMs, def);

  state.blur = get('blur', 0);
  state.brightness = get('brightness', 1);
  state.saturation = get('saturation', 1);
  state.contrast = get('contrast', 1);
  state.textOpacity = get('textOpacity', 1);
  state.vignette = get('vignette', 0);

  // Flicker: modulate brightness with sine + noise
  const flickerFrames = groups['flicker'] ?? [];
  const flickerVal = interpolateNumeric(flickerFrames, currentMs, 0);
  if (flickerVal > 0) {
    const noise = Math.sin(currentMs / 150) * flickerVal * 0.15
      + (Math.random() - 0.5) * flickerVal * 0.08;
    state.brightness = Math.max(0.05, state.brightness + noise);
  }

  // Shake: random displacement
  const shakeVal = get('shake', 0);
  if (shakeVal > 0) {
    state.shakeX = (Math.random() - 0.5) * 2 * shakeVal;
    state.shakeY = (Math.random() - 0.5) * 2 * shakeVal;
  }

  // Tint: use last keyframe at or before currentMs
  const tintFrames = (groups['tint'] ?? []).filter(kf => kf.timeMs <= currentMs);
  if (tintFrames.length > 0) {
    const from = tintFrames[tintFrames.length - 1];
    const fromHex = typeof from.value === 'string' ? from.value : null;
    // Check if transitioning to next tint keyframe
    const allTint = groups['tint'] ?? [];
    const fromIdx = allTint.indexOf(from);
    const toKf = allTint[fromIdx + 1];

    if (toKf && fromHex) {
      const transMs = toKf.transitionMs > 0 ? toKf.transitionMs : 0;
      const transStart = toKf.timeMs - transMs;
      const toHex = typeof toKf.value === 'string' ? toKf.value : fromHex;

      if (transMs > 0 && currentMs >= transStart && currentMs < toKf.timeMs) {
        const t = (currentMs - transStart) / transMs;
        const fromRgb = hexToRgb(fromHex);
        const toRgb = hexToRgb(toHex);
        if (fromRgb && toRgb) {
          const r = Math.round(lerp(fromRgb.r, toRgb.r, t));
          const g = Math.round(lerp(fromRgb.g, toRgb.g, t));
          const b = Math.round(lerp(fromRgb.b, toRgb.b, t));
          state.tint = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        } else {
          state.tint = fromHex;
        }
      } else if (currentMs >= toKf.timeMs) {
        state.tint = toHex;
      } else {
        state.tint = fromHex;
      }
    } else {
      state.tint = fromHex;
    }

    // Tint opacity scales with vignette strength (more darkness → more visible tint)
    state.tintOpacity = 0.25 + state.vignette * 0.25;
  }

  return state;
}

// ------------------------------------------------------------
// DOM application
// ------------------------------------------------------------

export function applyVFXToDOM(
  contentEl: HTMLElement | null,
  tintEl: HTMLElement | null,
  vignetteEl: HTMLElement | null,
  state: VFXState,
): void {
  if (!contentEl) return;

  // CSS filter
  const filters: string[] = [];
  if (state.blur > 0.05)          filters.push(`blur(${state.blur.toFixed(2)}px)`);
  if (Math.abs(state.brightness - 1) > 0.02) filters.push(`brightness(${state.brightness.toFixed(3)})`);
  if (Math.abs(state.saturation - 1) > 0.02) filters.push(`saturate(${state.saturation.toFixed(3)})`);
  if (Math.abs(state.contrast - 1) > 0.02)   filters.push(`contrast(${state.contrast.toFixed(3)})`);
  contentEl.style.filter = filters.join(' ');

  // Text opacity
  contentEl.style.opacity = state.textOpacity < 0.99 ? String(state.textOpacity.toFixed(3)) : '';

  // Shake transform
  if (state.shakeX !== 0 || state.shakeY !== 0) {
    contentEl.style.transform = `translate(${state.shakeX.toFixed(1)}px, ${state.shakeY.toFixed(1)}px)`;
  } else {
    contentEl.style.transform = '';
  }

  // Tint overlay
  if (tintEl) {
    if (state.tint && state.tintOpacity > 0) {
      const rgb = hexToRgb(state.tint);
      if (rgb) {
        tintEl.style.background = `rgba(${rgb.r},${rgb.g},${rgb.b},${state.tintOpacity.toFixed(3)})`;
        tintEl.style.display = '';
      }
    } else {
      tintEl.style.background = '';
      tintEl.style.display = 'none';
    }
  }

  // Vignette overlay
  if (vignetteEl) {
    if (state.vignette > 0.02) {
      const darkness = (state.vignette * 0.92).toFixed(3);
      vignetteEl.style.background = `radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,${darkness}) 100%)`;
      vignetteEl.style.display = '';
    } else {
      vignetteEl.style.background = '';
      vignetteEl.style.display = 'none';
    }
  }
}

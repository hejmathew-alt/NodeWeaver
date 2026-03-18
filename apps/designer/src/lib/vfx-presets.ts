import type { VFXEffectType } from '@nodeweaver/engine';

export interface VFXPresetKeyframe {
  timeMs: number;
  effect: VFXEffectType;
  value: number | string;
  transitionMs: number;
  prompt?: string;
}

export interface VFXPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'ambient' | 'dramatic' | 'player-state' | 'environmental';
  keyframes: VFXPresetKeyframe[];
}

export const VFX_PRESETS: VFXPreset[] = [
  // ── Ambient ──────────────────────────────────────────────
  {
    id: 'candlelight',
    name: 'Candlelight',
    icon: '🕯',
    description: 'Warm amber glow, flickering shadows',
    category: 'ambient',
    keyframes: [
      { timeMs: 0, effect: 'tint',       value: '#7a3800', transitionMs: 1200 },
      { timeMs: 0, effect: 'brightness', value: 0.75,      transitionMs: 1200 },
      { timeMs: 0, effect: 'flicker',    value: 0.3,       transitionMs: 800  },
      { timeMs: 0, effect: 'vignette',   value: 0.65,      transitionMs: 1200 },
    ],
  },
  {
    id: 'moonlight',
    name: 'Moonlight',
    icon: '🌙',
    description: 'Cold blue-silver, deep shadows',
    category: 'ambient',
    keyframes: [
      { timeMs: 0, effect: 'tint',       value: '#2a3a5c', transitionMs: 1500 },
      { timeMs: 0, effect: 'brightness', value: 0.55,      transitionMs: 1500 },
      { timeMs: 0, effect: 'saturation', value: 0.7,       transitionMs: 1500 },
      { timeMs: 0, effect: 'vignette',   value: 0.7,       transitionMs: 1500 },
    ],
  },
  {
    id: 'fluorescent',
    name: 'Fluorescent Buzz',
    icon: '💡',
    description: 'Harsh white light, subtle stutter',
    category: 'ambient',
    keyframes: [
      { timeMs: 0, effect: 'tint',       value: '#d0e8ff', transitionMs: 400 },
      { timeMs: 0, effect: 'brightness', value: 1.1,       transitionMs: 400 },
      { timeMs: 0, effect: 'flicker',    value: 0.08,      transitionMs: 200 },
    ],
  },

  // ── Dramatic ─────────────────────────────────────────────
  {
    id: 'blackout',
    name: 'Blackout',
    icon: '⬛',
    description: 'Slow fade to complete darkness',
    category: 'dramatic',
    keyframes: [
      { timeMs: 0,    effect: 'brightness', value: 1,   transitionMs: 0   },
      { timeMs: 600,  effect: 'brightness', value: 0,   transitionMs: 700 },
    ],
  },
  {
    id: 'lightning',
    name: 'Lightning Flash',
    icon: '⚡',
    description: 'Single sharp white spike then dark',
    category: 'dramatic',
    keyframes: [
      { timeMs: 0,   effect: 'brightness', value: 3.5, transitionMs: 40  },
      { timeMs: 120, effect: 'brightness', value: 0.65, transitionMs: 300 },
    ],
  },
  {
    id: 'emergency',
    name: 'Emergency Red',
    icon: '🚨',
    description: 'Dim red light, power-failure pulse',
    category: 'dramatic',
    keyframes: [
      { timeMs: 0, effect: 'tint',       value: '#7a0000', transitionMs: 600  },
      { timeMs: 0, effect: 'brightness', value: 0.35,      transitionMs: 600  },
      { timeMs: 0, effect: 'vignette',   value: 0.55,      transitionMs: 600  },
      { timeMs: 0, effect: 'flicker',    value: 0.15,      transitionMs: 400  },
    ],
  },

  // ── Player State ─────────────────────────────────────────
  {
    id: 'concussion',
    name: 'Concussion',
    icon: '💫',
    description: 'Blurred, desaturated, disoriented',
    category: 'player-state',
    keyframes: [
      { timeMs: 0, effect: 'blur',       value: 7,    transitionMs: 800 },
      { timeMs: 0, effect: 'saturation', value: 0.15, transitionMs: 800 },
      { timeMs: 0, effect: 'brightness', value: 0.65, transitionMs: 800 },
    ],
  },
  {
    id: 'poisoned',
    name: 'Poisoned',
    icon: '☠',
    description: 'Sickly green tint, pulsing blur',
    category: 'player-state',
    keyframes: [
      { timeMs: 0, effect: 'tint',       value: '#1a4a1a', transitionMs: 1000 },
      { timeMs: 0, effect: 'saturation', value: 1.5,       transitionMs: 1000 },
      { timeMs: 0, effect: 'blur',       value: 2,         transitionMs: 1000 },
      { timeMs: 0, effect: 'flicker',    value: 0.12,      transitionMs: 600  },
    ],
  },
  {
    id: 'tension',
    name: 'Tension',
    icon: '😰',
    description: 'Closing vignette, draining colour',
    category: 'player-state',
    keyframes: [
      { timeMs: 0, effect: 'vignette',   value: 0.8,  transitionMs: 2000 },
      { timeMs: 0, effect: 'saturation', value: 0.55, transitionMs: 2000 },
      { timeMs: 0, effect: 'brightness', value: 0.8,  transitionMs: 2000 },
    ],
  },
  {
    id: 'euphoria',
    name: 'Euphoria',
    icon: '✨',
    description: 'Warm bloom, heightened saturation',
    category: 'player-state',
    keyframes: [
      { timeMs: 0, effect: 'tint',       value: '#ffd8a8', transitionMs: 1500 },
      { timeMs: 0, effect: 'brightness', value: 1.3,       transitionMs: 1500 },
      { timeMs: 0, effect: 'saturation', value: 1.6,       transitionMs: 1500 },
    ],
  },
  {
    id: 'adrenaline',
    name: 'Adrenaline',
    icon: '⚡',
    description: 'Sharpened contrast, micro-shake',
    category: 'player-state',
    keyframes: [
      { timeMs: 0, effect: 'contrast',   value: 1.5, transitionMs: 300 },
      { timeMs: 0, effect: 'brightness', value: 1.1, transitionMs: 300 },
      { timeMs: 0, effect: 'shake',      value: 4,   transitionMs: 200 },
    ],
  },

  // ── Environmental ─────────────────────────────────────────
  {
    id: 'underwater',
    name: 'Underwater',
    icon: '🌊',
    description: 'Deep blue murk, soft blur',
    category: 'environmental',
    keyframes: [
      { timeMs: 0, effect: 'tint',       value: '#0a2a50', transitionMs: 1200 },
      { timeMs: 0, effect: 'blur',       value: 2,         transitionMs: 1200 },
      { timeMs: 0, effect: 'saturation', value: 0.7,       transitionMs: 1200 },
      { timeMs: 0, effect: 'brightness', value: 0.65,      transitionMs: 1200 },
    ],
  },
  {
    id: 'memory',
    name: 'Memory',
    icon: '🔮',
    description: 'Faded, desaturated, soft edges',
    category: 'environmental',
    keyframes: [
      { timeMs: 0, effect: 'saturation', value: 0.1,  transitionMs: 1500 },
      { timeMs: 0, effect: 'blur',       value: 2.5,  transitionMs: 1500 },
      { timeMs: 0, effect: 'vignette',   value: 0.5,  transitionMs: 1500 },
      { timeMs: 0, effect: 'brightness', value: 0.7,  transitionMs: 1500 },
    ],
  },
  {
    id: 'deep-space',
    name: 'Deep Space',
    icon: '🌌',
    description: 'Extreme contrast, near-total darkness',
    category: 'environmental',
    keyframes: [
      { timeMs: 0, effect: 'contrast',   value: 1.7,     transitionMs: 2000 },
      { timeMs: 0, effect: 'saturation', value: 0.3,     transitionMs: 2000 },
      { timeMs: 0, effect: 'vignette',   value: 0.88,    transitionMs: 2000 },
      { timeMs: 0, effect: 'tint',       value: '#000818', transitionMs: 2000 },
    ],
  },
];

export const PRESET_CATEGORIES: { id: VFXPreset['category']; label: string }[] = [
  { id: 'ambient',      label: 'Ambient Light' },
  { id: 'dramatic',     label: 'Dramatic' },
  { id: 'player-state', label: 'Player State' },
  { id: 'environmental', label: 'Environmental' },
];

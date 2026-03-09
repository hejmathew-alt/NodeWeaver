import type { GenreSlug } from '../types';

export interface GenreMeta {
  label: string;
  brief: string;
  /** Tailwind/CSS colour tokens for canvas theming */
  theme: {
    background: string;
    nodeStory: string;
    nodeCombat: string;
    nodeChat: string;
    nodeTwist: string;
  };
}

export const GENRE_META: Record<GenreSlug, GenreMeta> = {
  'sci-fi': {
    label: 'Sci-Fi',
    brief:
      'Technical, speculative, vast scale. Cold logic vs human emotion. The universe is indifferent; characters are not.',
    theme: {
      background: '#0a1628',
      nodeStory: '#1e4d8c',
      nodeCombat: '#8b1a1a',
      nodeChat: '#1a6b3c',
      nodeTwist: '#6b2d8b',
    },
  },
  fantasy: {
    label: 'Fantasy',
    brief:
      'Mythic, lyrical, world-building heavy. Magic has rules and cost. The old world bleeds into the new.',
    theme: {
      background: '#0f1a0a',
      nodeStory: '#2d5a1a',
      nodeCombat: '#7a2020',
      nodeChat: '#1a5a3a',
      nodeTwist: '#5a3a7a',
    },
  },
  horror: {
    label: 'Horror',
    brief:
      'Dread over shock. Slow burn. The unknown is scarier than the known. Show the shadow, not the monster.',
    theme: {
      background: '#0d0000',
      nodeStory: '#4a0a0a',
      nodeCombat: '#6b0000',
      nodeChat: '#1a3a1a',
      nodeTwist: '#3a0a4a',
    },
  },
  'mystery-noir': {
    label: 'Mystery / Noir',
    brief:
      'Sparse, cynical, every detail matters. Subtext over exposition. Everyone has a secret; most have a price.',
    theme: {
      background: '#0a0a14',
      nodeStory: '#3a3a1a',
      nodeCombat: '#5a2a0a',
      nodeChat: '#1a2a3a',
      nodeTwist: '#3a1a4a',
    },
  },
  'post-apocalyptic': {
    label: 'Post-Apocalyptic',
    brief:
      'Survival pragmatism. Loss of the old world. Dark hope. Beauty in the broken. Every kindness is a risk.',
    theme: {
      background: '#120a00',
      nodeStory: '#5a3a0a',
      nodeCombat: '#6b2000',
      nodeChat: '#2a3a1a',
      nodeTwist: '#4a2a1a',
    },
  },
  cyberpunk: {
    label: 'Cyberpunk',
    brief:
      'Corporate dystopia. High tech, low life. Wit and grit. The network is the battlefield; identity is the weapon.',
    theme: {
      background: '#050010',
      nodeStory: '#1a0a5a',
      nodeCombat: '#5a0a1a',
      nodeChat: '#0a3a1a',
      nodeTwist: '#4a0a6b',
    },
  },
  custom: {
    label: 'Custom',
    brief: '',
    theme: {
      background: '#0a0a0a',
      nodeStory: '#1a2a3a',
      nodeCombat: '#3a1a1a',
      nodeChat: '#1a3a1a',
      nodeTwist: '#2a1a3a',
    },
  },
};

/** Returns the AI writing brief for a story, handling the custom case. */
export function getGenreBrief(
  genre: GenreSlug,
  customBrief?: string
): string {
  if (genre === 'custom') return customBrief ?? '';
  return GENRE_META[genre].brief;
}

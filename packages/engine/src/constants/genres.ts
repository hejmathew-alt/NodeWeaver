import type { GenreSlug } from '../types';

export interface GenreMeta {
  label: string;
  brief: string;
  /** Sample lines for the Test Voice button — one is picked at random */
  voiceTestLines: string[];
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
    voiceTestLines: [
      'Sensors are picking up something unusual beyond the outer ring.',
      'The stars drift silently past the observation deck as the ship enters orbit.',
      'Captain, the signal is getting stronger. Whatever it is, it\'s getting closer.',
      'We weren\'t supposed to find anything out here.',
      'All systems operational. Preparing for interstellar jump.',
      'This signal has been repeating for centuries, and we just answered it.',
    ],
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
    voiceTestLines: [
      'The path through the forest is dark, but the journey must continue.',
      'Long before the kingdoms fell, a quiet power stirred beneath the mountains.',
      'Stay close. The woods are older than they appear, and they do not welcome strangers.',
      'Some doors should never be opened, yet here we stand.',
      'If the legends are true, then our fate will be decided before sunrise.',
      'The air hums with ancient magic, waiting for someone brave enough to listen.',
    ],
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
    voiceTestLines: [
      'The hallway stretches longer than it should. The lights flicker once, then go still.',
      'I can hear it breathing on the other side of the wall.',
      'Don\'t look at the window. Whatever you do, don\'t look at the window.',
      'The last entry in the logbook was dated three weeks ago. The ink is still wet.',
      'Something moved in the basement. I locked the door, but the lock is on the wrong side.',
      'The radio crackled to life on its own. The voice on the other end was mine.',
    ],
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
    voiceTestLines: [
      'The rain hadn\'t stopped in three days. Neither had the feeling I was being followed.',
      'She lit a cigarette and said nothing. That told me everything.',
      'The file was supposed to be empty. It wasn\'t.',
      'Everyone in this town has a story. Most of them are lies.',
      'The witness changed her statement twice. The third version was the most interesting.',
      'I found the photograph in a dead man\'s coat. He wasn\'t supposed to know her.',
    ],
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
    voiceTestLines: [
      'The water is clean enough if you boil it twice. That\'s the best we can hope for.',
      'We passed a city on the way here. At least, that\'s what it used to be.',
      'Supplies will last another week. After that, we move or we starve.',
      'There are lights in the distance. Could be traders. Could be worse.',
      'The old highway is overgrown now. Nature doesn\'t wait for permission.',
      'She carved a mark into the wall for every day survived. The wall is almost full.',
    ],
    theme: {
      background: '#120a00',
      nodeStory: '#5a3a0a',
      nodeCombat: '#6b2000',
      nodeChat: '#2a3a1a',
      nodeTwist: '#4a2a1a',
    },
  },
  survival: {
    label: 'Survival',
    brief:
      'Extreme conditions, shrinking resources. The body has limits; the will tests them. Choices are immediate and irreversible — the wrong one ends everything here.',
    voiceTestLines: [
      "Twelve hours without water. Twelve more to the river, if the map is right.",
      "The shelter won't last another night in this wind. We move at first light.",
      "I found tracks this morning. Something large. It found our camp first.",
      "Three matches left. I'm going to make them count.",
      "She's burning up. The fever won't break. I don't know what I'm doing, but I'm not stopping.",
      "The others want to go back. There is no back. Not anymore.",
    ],
    theme: {
      background: '#060e06',
      nodeStory: '#2a4a1a',
      nodeCombat: '#5a2a0a',
      nodeChat: '#1a3a1a',
      nodeTwist: '#3a3a0a',
    },
  },
  cyberpunk: {
    label: 'Cyberpunk',
    brief:
      'Corporate dystopia. High tech, low life. Wit and grit. The network is the battlefield; identity is the weapon.',
    voiceTestLines: [
      'The neon bleeds through the rain. Another night in a city that never sleeps and never cares.',
      'Your implant is broadcasting. Either shut it down or accept you\'re being tracked.',
      'The corps own the skyline. Down here, we own the streets. For now.',
      'Fifty credits buys you a meal. A hundred buys you information. Everything else has a different price.',
      'The firewall went down at midnight. By morning, three executives had vanished.',
      'She jacked in without a trace. When she came back, her eyes were different.',
    ],
    theme: {
      background: '#050010',
      nodeStory: '#1a0a5a',
      nodeCombat: '#5a0a1a',
      nodeChat: '#0a3a1a',
      nodeTwist: '#4a0a6b',
    },
  },
  comedy: {
    label: 'Comedy',
    brief:
      'Timing is everything. Subvert expectations. Ground absurdity in real emotion. The best jokes land because the characters don\'t know they\'re funny.',
    voiceTestLines: [
      'I\'m not saying the plan was bad. I\'m saying the fire department now has our photo on their wall.',
      'She said meet her at the restaurant at eight. I showed up at seven to practise looking casual.',
      'The good news is we found the exit. The bad news is it\'s on the ceiling.',
      'I read the instructions twice. That was my first mistake.',
      'He delivered the speech with total confidence. Nobody had the heart to tell him his notes were upside down.',
      'Technically, nothing exploded. I feel like we should celebrate that.',
    ],
    theme: {
      background: '#14100a',
      nodeStory: '#8a6d2a',
      nodeCombat: '#7a3a1a',
      nodeChat: '#2a6a3a',
      nodeTwist: '#6a3a6a',
    },
  },
  romance: {
    label: 'Romance',
    brief:
      'Intimate, emotionally charged, tension-driven. Desire and restraint in equal measure. The unsaid word matters as much as the spoken one. Every scene should raise the stakes of the heart.',
    voiceTestLines: [
      "I told myself I wouldn't look for you tonight. I lied.",
      "You always leave before things get complicated. Maybe that's why I keep letting you back in.",
      "This was supposed to be simple. Nothing about you has ever been simple.",
      "Some people walk into your life and rearrange everything without asking.",
      "I don't need you to say anything. Just don't go.",
      "Every time I think I'm done feeling this way, you smile, and I have to start over.",
    ],
    theme: {
      background: '#1a0810',
      nodeStory: '#7a2048',
      nodeCombat: '#7a2a20',
      nodeChat: '#3a1a4a',
      nodeTwist: '#5a1a3a',
    },
  },
  children: {
    label: "Children's",
    brief:
      "Dark wit, preposterous adults, children who are quietly brilliant. The grotesque is funny here. Justice arrives — and it tends to be delightfully horrible for those who deserve it.",
    voiceTestLines: [
      "The adults thought they had thought of everything. They had not thought of her.",
      "It was the most disgusting thing she had ever seen, and also, somehow, the most magnificent.",
      "He was the worst sort of grown-up: absolutely certain he was right, and spectacularly wrong.",
      "Nobody believed him at first. That was, of course, their catastrophic mistake.",
      "She had spent years being underestimated. She found it very useful.",
      "The punishment, they would later agree, had been remarkably fair.",
    ],
    theme: {
      background: '#0a0f0a',
      nodeStory: '#4a6a0a',
      nodeCombat: '#6a3a0a',
      nodeChat: '#1a4a2a',
      nodeTwist: '#5a2a6a',
    },
  },
  custom: {
    label: 'Custom',
    brief: '',
    voiceTestLines: [
      'The journey ahead is uncertain, but the first step has already been taken.',
      'Something shifted in the air. A change was coming, whether they were ready or not.',
      'We have been walking for hours. The destination is close, I can feel it.',
      'Tell me what you see. Every detail matters now.',
    ],
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

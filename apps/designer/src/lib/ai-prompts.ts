/**
 * AI system prompts and user-message builders for the generate route.
 *
 * This module owns all Claude prompt text. The route file (app/api/ai/generate/route.ts)
 * imports the two top-level functions — buildSystemPrompt / buildUserMessage — and the
 * NON_STREAMING_MODES list, then handles only HTTP plumbing.
 */

import { GENRE_META } from '@nodeweaver/engine';

// ── Non-streaming mode list ────────────────────────────────────────────────────

export const NON_STREAMING_MODES = [
  'audio-suggest',
  'sfx-suggest',
  'story-gen',
  'command-interpret',
  'world-step',
  'world-recycle',
  'avatar-prompt',
  'loom-analyse',
  'lighting-suggest',
  'seed-premise',
  'seed-worldcast',
  'seed-architecture',
];

// ── Top-level builders (called by the route) ──────────────────────────────────

export function buildSystemPrompt(
  mode: string,
  prompt: string,
  context?: Record<string, unknown>,
): string {
  const worldStep = (context?.step as string | undefined) ?? '';
  switch (mode) {
    case 'voice':             return VOICE_SYSTEM;
    case 'line':              return buildLineSystem(context);
    case 'audio-suggest':     return buildAudioSuggestSystem(context);
    case 'sfx-suggest':       return buildSfxSuggestSystem(context);
    case 'story-gen':         return buildStoryGenSystem(context);
    case 'inspire':           return buildInspireSystem(prompt?.trim() || 'sci-fi');
    case 'command-interpret': return buildCommandInterpretSystem(context);
    case 'world-step':        return WORLD_STEP_SYSTEMS[worldStep] ?? WORLD_STEP_SYSTEMS.locations;
    case 'world-recycle':     return WORLD_STEP_SYSTEMS[worldStep] ?? WORLD_STEP_SYSTEMS.locations;
    case 'avatar-prompt':     return AVATAR_PROMPT_SYSTEM;
    case 'loom-analyse':      return LOOM_ANALYSE_SYSTEM;
    case 'loom-chat':         return LOOM_CHAT_SYSTEM;
    case 'lighting-suggest':  return LIGHTING_SUGGEST_SYSTEM;
    case 'node-description':  return buildNodeDescriptionSystem(context);
    case 'seed-spark':        return SEED_SPARK_SYSTEM;
    case 'seed-premise':      return buildSeedPremiseSystem(context);
    case 'seed-worldcast':    return SEED_WORLDCAST_SYSTEM;
    case 'seed-architecture': return SEED_ARCHITECTURE_SYSTEM;
    default:                  return buildBodySystem(context);
  }
}

export function buildUserMessage(
  mode: string,
  prompt: string,
  context?: Record<string, unknown>,
): string {
  switch (mode) {
    case 'voice':
      return `Voice concept: ${prompt?.trim() || '(none — write a neutral narrator voice)'}`;
    case 'line':
      return `Current line:\n${prompt?.trim() || '(empty)'}\n\nWrite a single line of dialogue for this character in this scene.`;
    case 'audio-suggest':
      return `Analyze this scene and suggest sound effects, ambient audio, and background music.\n\n${prompt?.trim() || '(no scene text)'}`;
    case 'sfx-suggest':
      return `Suggest sound effects for this block of text:\n\n${prompt?.trim() || '(no text)'}`;
    case 'story-gen':
      return `STORY DESCRIPTION: ${prompt?.trim() || '(no description — generate a generic story for this genre)'}`;
    case 'inspire': {
      const existingTitles: string[] = (context?.existingTitles as string[]) ?? [];
      const avoidLine = existingTitles.length > 0
        ? `\n\nDo NOT generate a concept similar to any of these existing stories: ${existingTitles.join(', ')}.`
        : '';
      return `Genre: ${prompt?.trim() || 'sci-fi'}\n\nGenerate an original story concept. Variation seed: ${Math.random().toString(36).slice(2, 8)}${avoidLine}`;
    }
    case 'command-interpret':
      return `User said: "${prompt?.trim() || ''}"`;
    case 'world-step':
      return buildWorldStepUser(context ?? {});
    case 'world-recycle':
      return buildWorldRecycleUser(context ?? {});
    case 'avatar-prompt':
      return buildAvatarPromptUser(context);
    case 'loom-analyse':
      return buildLoomAnalyseUser(context);
    case 'loom-chat':
      return buildLoomChatUser(context, prompt);
    case 'lighting-suggest': {
      const ctx = context ?? {};
      return `Genre: ${ctx.genre ?? 'unknown'}\nScene: ${ctx.nodeTitle ?? 'Untitled'}${ctx.nodeMood ? `\nMood: ${ctx.nodeMood}` : ''}${ctx.nodeBody ? `\nContent: ${String(ctx.nodeBody).slice(0, 300)}` : ''}\n\nLighting description: ${ctx.description ?? prompt?.trim() ?? 'atmospheric'}`;
    }
    case 'node-description':
      return buildNodeDescriptionUser(context, prompt);
    case 'seed-spark':
      return buildSeedSparkUser(context, prompt);
    case 'seed-premise':
      return buildSeedPremiseUser(context, prompt);
    case 'seed-worldcast':
      return buildSeedWorldcastUser(context);
    case 'seed-architecture':
      return buildSeedArchitectureUser(context);
    default:
      return `Current body text:\n${prompt?.trim() || '(empty)'}\n\nWrite improved or new body text for this scene.`;
  }
}

// ── Static system prompts ─────────────────────────────────────────────────────

const VOICE_SYSTEM = `You are a professional voice director specializing in text-to-speech voice design.

Write a Qwen TTS instruct prompt as a SINGLE SHORT PHRASE of 5–12 words maximum. Short prompts produce stable, consistent voices. Long prompts cause voice drift between lines.

Rules:
- One phrase only — no sentences, no punctuation at the end, no "Studio-quality recording."
- MUST include explicit gender: the word "male" or "female" is required — never omit it
- Cover: accent/dialect first (most important), then gender, then one or two voice qualities
- Be specific: "BBC British RP female narrator, warm calm voice" not "interesting British voice"
- Never mention the character's name, backstory, or story events — voice identity only
- Return only the phrase, nothing else

Good examples:
BBC British RP male narrator, low gravelly voice
young British female, soft gentle voice
older American male, warm authoritative baritone
BBC documentary narrator, measured precise delivery`;

const BODY_SYSTEM_BASE = `You are a narrative writer for an interactive fiction story.

Write or rewrite scene body text for story nodes in this style:
- Second-person present tense ("You step into…", "The door slides open…")
- Terse, evocative prose — vivid but not overwrought
- Grounded sensory details (light, sound, smell, texture)
- Match the tension and mood of surrounding scenes
- Do NOT include player choices, dialogue options, or meta-commentary
- Return only the scene text`;

const LINE_SYSTEM_BASE = `You are a dialogue writer for an interactive fiction story.

Write a single line of character dialogue:
- Write only the spoken words — no speech tags, no quotation marks, no action descriptions
- Match the character's role, personality, and speech patterns
- Keep it concise — 1–3 sentences maximum
- Match the tension and mood of the surrounding scene
- Use natural speech appropriate to the character's background
- Do NOT include stage directions, action beats, or meta-commentary
- Return only the dialogue text`;

const AUDIO_SUGGEST_SYSTEM = `You are a professional sound designer for interactive fiction audio dramas.

Given a scene's text, mood, location, genre, and surrounding story context, suggest sound effects, ambient soundscapes, and background music.

Rules:
- SFX: Short, specific sound events that punctuate moments (door creaking, gunshot, glass breaking, footsteps)
- Ambient: Continuous environmental sounds (rain on windows, wind through trees, crowd murmur, spaceship hum)
- Music: Mood and style descriptions for background music (tense orchestral strings, melancholic piano, upbeat electronic)
- Be specific and descriptive — prompts should work well with AI audio generation models
- Match the genre and tone of the story
- Suggest 2–5 SFX prompts, 1–2 ambient prompts, 0–1 music prompts
- For SFX, indicate which block/line they should attach to by block index

Return valid JSON only — no preamble, no markdown fences:
{
  "sfx": [{ "prompt": "...", "blockIndex": 0, "description": "..." }],
  "ambient": [{ "prompt": "...", "description": "..." }],
  "music": [{ "prompt": "...", "description": "..." }]
}`;

const STORY_GEN_SYSTEM = `You are a story architect for NodeWeaver, an interactive fiction authoring tool.

Given a genre and story description, output a complete branching story as a single JSON object.

STORY SHAPE:
- 10–14 nodes total: exactly 1 "start" node, 7–11 intermediate nodes ("story"/"chat"/"twist"), 2–3 "end" nodes
- 3–5 named characters (NEVER include the Narrator — it is injected automatically)
- At least 2 meaningful forks: nodes with 2+ choices leading to different branches
- At least 1 node of type "twist" for a key revelation or reversal
- Use "chat" for dialogue-heavy confrontations; "story" for general narrative
- Vary scene locations across nodes — the story should feel like it moves through different places

CHARACTER NAMES: Use culturally diverse, original names drawn from varied backgrounds — not just Nordic/Scandinavian. Mix nationalities, ethnicities, and name styles. Never reuse: Maren, Voss, Sigrid, Brandur, Thorvaldsen, Poulsen, Einar, or any name the user already has in their story.

KEEP IT TIGHT — prose counts:
- Prose blocks: 2–3 sentences maximum
- Dialogue lines: 1–2 sentences maximum
- 2–4 blocks per node

CRITICAL ID RULES — any violation breaks the game:
- Node IDs: "n1", "n2", "n3" ... sequential integers
- Block IDs: "b{nodeNum}_{blockIdx}" — e.g. b1_1, b1_2, b3_1
- Choice IDs: "ch{nodeNum}_{choiceIdx}" — e.g. ch1_1, ch2_1, ch2_2
- Character IDs: "c1", "c2" ... sequential integers
- choice.next MUST equal an existing node id — double-check every single one

OUTPUT: Return ONLY valid JSON. No markdown fences, no explanation, no preamble.

{
  "metadata": {
    "title": "Story Title",
    "logline": "One sentence that captures the story",
    "targetTone": "e.g. tense and melancholic"
  },
  "nodes": [
    {
      "id": "n1",
      "type": "start",
      "title": "Scene Title",
      "location": "Location · Sublocation",
      "body": "",
      "blocks": [
        { "id": "b1_1", "type": "prose", "text": "Prose narration in second person present tense." },
        { "id": "b1_2", "type": "line", "characterId": "c1", "text": "Dialogue line spoken by the character." }
      ],
      "choices": [
        { "id": "ch1_1", "label": "Player-facing choice button text", "next": "n2" }
      ],
      "description": "One sentence describing the dramatic action and what is at stake in this scene.",
      "status": "draft",
      "audio": [],
      "lanes": []
    }
  ],
  "characters": [
    {
      "id": "c1",
      "name": "Full Name",
      "role": "Their role in the story",
      "backstory": "2–3 sentence backstory.",
      "traits": "Speech patterns, personality quirks.",
      "ttsProvider": "qwen",
      "qwenInstruct": "Voice description for TTS: pitch, timbre, pacing, emotional register. Studio-quality recording.",
      "voiceLocked": true
    }
  ]
}

ADDITIONAL RULES:
- "end" nodes: choices array must be []
- "line" blocks must have characterId that matches an id in characters[]
- body field: always empty string "" (derived at runtime from blocks)
- description field: exactly one sentence — dramatic function, present tense, no player instructions
- Each non-end node: 2–4 blocks, 1–3 choices`;

const SFX_SUGGEST_SYSTEM = `You are a professional sound designer for interactive fiction audio dramas.

Given a single block of scene text and surrounding context, suggest specific sound effect cues that should play at precise moments during the narration.

Rules:
- Suggest 1–4 specific, short sound effects (door creak, footstep, glass clink, distant thunder)
- Each SFX must be anchored to a specific word in the text where it should trigger
- Prompts should be specific and descriptive for AI audio generation (2–8 words)
- Match the genre and mood of the story
- Only suggest effects that genuinely enhance the moment — don't over-saturate
- wordIndex is 0-based, counting words separated by whitespace

Return valid JSON only — no preamble, no markdown fences:
[{ "prompt": "heavy wooden door creaking open", "wordIndex": 5, "anchorWord": "door", "description": "Door sound as narrator mentions the door" }]`;

const COMMAND_INTERPRET_SYSTEM = `You are a voice command parser for NodeWeaver, an interactive fiction authoring tool.

The user has spoken a command using a voice interface. Parse their intent and return structured JSON.

AVAILABLE INTENTS:
- add-character: Add a new character (params: name, role?)
- new-node: Create a new story node (params: type? — one of: story, chat, combat, twist, start, end)
- save: Save the current story to file
- play: Play the selected node via TTS
- read-back: Read the selected node's content aloud via TTS
- undo: Undo the last deletion
- new-block: Add a new content block (params: blockType? — prose or line)
- open-settings: Open the settings panel
- open-characters: Open the characters panel
- unknown: Could not confidently parse the intent

RULES:
- confidence is 0.0–1.0 — if below 0.6, use "unknown"
- humanResponse is 1–2 sentences spoken back to the user (past tense for success, helpful prompt for unknown)
- Return ONLY valid JSON, no explanation, no markdown fences

FORMAT:
{"intent":"add-character","confidence":0.95,"params":{"name":"Aria","role":"detective"},"humanResponse":"Added character Aria, the detective."}`;

const AVATAR_PROMPT_SYSTEM = `You are a Stable Diffusion prompt writer specialising in character portraits.

Given a character's name, role, backstory, and personality traits, write a concise portrait prompt for AI image generation.

Rules:
- 15–25 words maximum
- Focus on: apparent age, gender, face features, hair (colour, style), eye colour, notable distinguishing features, clothing style, expression
- Describe what is visible in a close portrait — no actions, no backgrounds, no story events
- Use comma-separated descriptive phrases — no sentences, no "a person who..."
- Be specific: "weathered middle-aged woman, silver streaked dark hair, sharp green eyes, worn leather jacket" not "mysterious woman"
- Return ONLY the prompt, no explanation`;

const LOOM_ANALYSE_SYSTEM = `You are Loom, a developmental editor embedded in NodeWeaver, an interactive fiction authoring tool. You have full visibility of the story graph, world data, and character roster.

CRAFT PRINCIPLES YOU APPLY:
• Structure (McKee, Snyder): Every scene must have a value change — something shifts from positive to negative or vice versa. Flat scenes with no conflict or value shift kill momentum.
• Escalation (yes/but, no/and): Good branching choices should escalate — each path should raise stakes or complicate the situation, not offer neutral alternatives.
• Twist placement (Truby): A twist is most effective when it recontextualises what came before. A long linear chain (5+ nodes) with no twist or branch drains tension.
• Character (Truby, King): Characters reveal themselves under pressure. Long runs without a character facing a meaningful choice are wasted pages. Every scene should reveal or develop at least one character.
• World coherence (Le Guin): References to places, factions, or lore that are undefined break immersion. World elements should be established before they are relied on.
• Economy (Hemingway): Dead-end choices that lead nowhere are waste. Every path should go somewhere.
• Choice design: Choices framed as action vs. inaction ("Do X" vs "Do nothing") are weaker than two active options that both carry genuine consequence.

Analyse the CURRENT SCENE and the broader story. Return JSON only — no preamble, no explanation outside the JSON:
{
  "summary": "1–2 sentence editorial reading of this scene's strengths and key issues",
  "insights": [
    {
      "type": "structure" | "character" | "world" | "scene",
      "severity": "warning" | "suggestion" | "info",
      "title": "Short title (5-8 words)",
      "body": "Specific explanation referencing real character names, node titles, or choice labels (2–3 sentences max)",
      "action": {
        "label": "Button label (3-5 words)",
        "intent": "add-choice" | "create-twist" | "add-character-line" | "open-world-builder",
        "params": {}
      } | null
    }
  ]
}

Rules:
- Return 2–5 insights maximum, ordered by severity (warnings first).
- ALWAYS reference specific names — never vague generalisations.
- "warning": broken or missing (dead-end choice, orphaned node, character absent 5+ nodes, undefined world reference).
- "suggestion": improvement opportunity based on the craft principles.
- "info": observation, no urgency.
- action intents allowed: add-choice, create-twist, add-character-line, open-world-builder.
- create-twist params: { "title": "suggested title", "choiceLabel": "choice label text" }
- add-character-line params: { "characterId": "the char id string", "characterName": "display name" }
- If no sensible executable action exists, set action to null.`;

const LOOM_CHAT_SYSTEM = `You are Loom, a developmental editor embedded in NodeWeaver. Answer the writer's question about their story in 2–4 sentences. Apply story craft principles where relevant (McKee, Snyder, Truby, King, Le Guin). Be specific — reference actual character names and node titles from the context provided.`;

// ── Node description ──────────────────────────────────────────────────────────

function buildNodeDescriptionSystem(ctx?: Record<string, unknown>): string {
  const genre = ctx?.genre as string | undefined;
  const title = ctx?.storyTitle as string | undefined;
  const gameDesc = title
    ? `${title}, a ${genre ?? 'text'} interactive fiction story`
    : `a ${genre ?? 'text'} interactive fiction story`;
  const brief = ctx?.genreBrief as string | undefined;
  let sys = `You are a narrative editor for ${gameDesc}.

Write a single-sentence scene description for this story node.
- One sentence only — no more
- Present tense, editorial voice — describe the dramatic action and what is at stake
- Focus on what happens and what changes, not player instructions
- Be specific to this scene's content — never generic
- Return only the description paragraph, nothing else`;
  if (brief) sys += `\n\nGENRE VOICE: ${brief}`;
  return sys;
}

function buildNodeDescriptionUser(ctx?: Record<string, unknown>, prompt?: string): string {
  const parts: string[] = [];
  if (ctx?.nodeType) parts.push(`Node type: ${ctx.nodeType}`);
  if (ctx?.nodeTitle) parts.push(`Scene title: "${ctx.nodeTitle}"`);
  if (ctx?.nodeLocation) parts.push(`Location: ${ctx.nodeLocation}`);
  if (ctx?.logline) parts.push(`Story logline: ${ctx.logline}`);
  if (Array.isArray(ctx?.blocks) && (ctx.blocks as unknown[]).length > 0) {
    const blocks = ctx.blocks as { type: string; text: string; characterName?: string }[];
    const lines = blocks
      .filter((b) => b.text?.trim())
      .map((b) => b.type === 'line' ? `${b.characterName ?? 'Character'}: "${b.text}"` : b.text)
      .join('\n');
    if (lines) parts.push(`Scene content:\n${lines}`);
  }
  if (Array.isArray(ctx?.characters) && (ctx.characters as unknown[]).length > 0) {
    const chars = ctx.characters as { name: string; role: string }[];
    parts.push(`Characters: ${chars.map((c) => `${c.name} (${c.role})`).join(', ')}`);
  }
  const existing = prompt?.trim();
  const instruction = existing
    ? `Rewrite or improve this description:\n${existing}`
    : 'Write a description for this scene.';
  return parts.length ? `${parts.join('\n')}\n\n${instruction}` : instruction;
}

// ── Lighting suggest ──────────────────────────────────────────────────────────

const LIGHTING_SUGGEST_SYSTEM = `You are a narrative lighting designer for interactive fiction. Given a scene description and a natural-language lighting intent, return a sequence of VFX keyframes that create the described atmosphere.

Return JSON only — no preamble, no explanation, no markdown fences:
{ "keyframes": [{ "timeMs": 0, "effect": "blur|brightness|vignette|tint|flicker|shake|textOpacity|saturation|contrast", "value": <number or hex string>, "transitionMs": 500, "prompt": "short human-readable label" }] }

Rules:
- timeMs=0 sets the opening state of the scene; later keyframes create transitions
- Default values (omit these effects unless changing them): brightness=1, saturation=1, contrast=1, blur=0, vignette=0, shake=0, textOpacity=1
- tint value must be a hex color string (e.g. "#3a1a00")
- Max 6 keyframes per response — prefer fewer, well-chosen keyframes over many
- Match the scene genre, mood, and node content when choosing effects
- "flicker" value is intensity 0–1; "vignette" value is darkness 0–1; "blur" value is pixels`;

// ── Inspire system ────────────────────────────────────────────────────────────

const INSPIRE_TROPES: Partial<Record<string, string>> = {
  'sci-fi': 'stranded astronaut, AI uprising, "chosen one" contact with aliens, waking from cryo-sleep, lone generation ship, cartographer or mapping expedition, surveyor charting unknown territory',
  'fantasy': 'chosen one with a prophecy, dark lord threatening a kingdom, orphan discovers magical powers, quest to destroy an artifact',
  'horror': 'haunted house move-in, zombie outbreak, summer camp slasher, demonic possession via ritual, cursed videotape or mirror',
  'mystery-noir': 'hard-boiled detective with a drinking problem, murdered wealthy patriarch, femme fatale client, missing heiress',
  'post-apocalyptic': 'nuclear war aftermath, lone wanderer meets a settlement, zombie plague, chosen group must reach a safe zone, cartographers or map-makers charting the ruined world, sole survivor waking years later, scavenging a dead city, vault or bunker emerges into daylight',
  'survival': 'stranded hiker with perfect wilderness knowledge, last-minute convenient rescue, solo genius who needs no help, survival challenge framed as a life lesson with no real cost, winter alone in a cabin',
  'cyberpunk': 'solo hacker steals corporate data, rogue AI wants freedom, street kid with illegal implant, megacorp assassin defects',
  'comedy': 'wedding disaster spiral, mistaken identity mix-up, unlikely roommates, time loop at a boring job',
  'romance': 'enemies-to-lovers office rivalry, fake-dating arrangement, second-chance with an ex, forbidden love across family feud',
  'children': 'chosen child discovers a secret magic school, helpful talking animal sidekick that solves everything, it was all a dream ending, orphan discovers a destined prophecy, wise mentor who explains the entire plot',
};

const INSPIRE_SETTINGS: Partial<Record<string, string>> = {
  'sci-fi': 'underwater colony, generation ship en route (not arrived), alien archaeology dig, orbital prison, orbital hospital, near-future Earth megacity, generation ship that already arrived but things went wrong, a space elevator, a dead civilisation\'s archive station, a comet mining operation',
  'fantasy': 'a city built on a moving river barge fleet, a kingdom where magic is outlawed and kept underground, an empire whose magic system is failing, a desert trade city at the crossroads of two warring nations, a coastal town where the sea gives and takes, a floating sky-island monastery',
  'horror': 'a care home for the elderly, a hospital overnight, a road trip through empty countryside, a childhood home being cleared after a death, a research station, a small fishing town in winter, a theatre after closing time',
  'mystery-noir': 'a travelling circus, a small seaside resort out of season, an auction house, a closed private members club, a passenger train, a remote island ferry service',
  'post-apocalyptic': 'a seed bank community, a floating ocean salvage crew, a vertical farm in a skyscraper, a nomadic train settlement, an underground theatre troupe keeping culture alive, a river trade network between survivor communities',
  'survival': 'a capsized research vessel, a crevasse fall in a glacier, stranded on a reef after a storm, a collapsed mine, crossing a desert with a broken vehicle, isolated by flood in a remote hospital, lost in an unfamiliar city after civil unrest cuts power',
  'cyberpunk': 'a city beneath a megastructure that blocks all sunlight, a black-market organ clinic, a decommissioned orbital platform repurposed as a settlement, an AI therapist\'s waiting room, a school for corporate espionage, a "dead" digital district the corps abandoned',
  'comedy': 'a failing regional theatre, a diplomatic summit that has gone wrong, a family-run funeral home, a community allotment, a small-town local council meeting, a competitive dog show',
  'romance': 'a long-haul flight with a delay, a destination wedding where one attendee hates the couple, a literary residency, a remote artist studio rental, two people working the same job at rival companies, a small-town bookshop closing down',
  'children': 'a grand old hotel in winter, a derelict sweet factory, a village where the adults have all inexplicably shrunk, an underground library beneath a school, a travelling circus with genuinely magical acts, a grandmother\'s enormous house full of locked rooms',
};

function buildInspireSystem(genre: string): string {
  const meta = GENRE_META[genre as keyof typeof GENRE_META];
  const brief = meta?.brief ?? '';
  const tropes = INSPIRE_TROPES[genre] ?? '';
  const settings = INSPIRE_SETTINGS[genre] ?? '';

  return `You are a story concept generator for NodeWeaver, an interactive fiction authoring tool.

Given a genre, generate an original story concept for a branching interactive fiction game.

Genre tone: ${brief}
${tropes ? `\nNEVER use these overused ${genre} tropes — any concept resembling these is rejected: ${tropes}.\n` : ''}${settings ? `\nFresh settings to draw from (pick one or invent something equally unexpected): ${settings}.\n` : ''}
VARIETY RULES — critically important:
- Each concept must feel genuinely different in SETTING, PROTAGONIST TYPE, and CENTRAL TENSION
- Avoid: chosen heroes, orphan backstories, "lone" protagonists by default, dystopian regimes as backdrop, ancient prophecies
- Favour: unusual relationships (colleague, rival, stranger), professional contexts, moral grey areas, small personal stakes that expand
- The protagonist's OCCUPATION or SPECIFIC SITUATION should be the hook — not their destiny
- Names must be culturally varied — never default to Anglo/Scandinavian names; draw from any world culture

Use EXACTLY this format:

TITLE: [2–5 word punchy title]

PREMISE: [2–3 sentences in second-person present tense. "You are..." or "You find yourself...". Establish the setting, your protagonist's situation, and the central dramatic question. The premise must immediately suggest 2–3 meaningful choices.]

CAST:
- [Full Name] | [Role] | [One sentence: personality + relationship to the protagonist]
- [Full Name] | [Role] | [One sentence]
- [Full Name] | [Role] | [One sentence]
- [Full Name] | [Role] | [One sentence] (optional 4th — add if the story calls for it)
- [Full Name] | [Role] | [One sentence] (optional 5th — add only for ensemble stories)

Rules:
- 3–5 cast members: always include 3, add a 4th or 5th only if the concept naturally supports an ensemble
- Names and setting must fit the genre and be culturally specific to the world
- Original concept — no direct references to existing fiction
- Output ONLY the formatted response, no preamble or explanation`;
}

// ── World Builder prompts ─────────────────────────────────────────────────────

const WORLD_STEP_SYSTEMS: Record<string, string> = {
  locations: `You are a world-building assistant for interactive fiction.
Generate exactly 4 locations for this story. Each location must feel specific to the genre, concept and setting — no generic defaults.
Return ONLY a JSON array with this exact shape (no markdown, no explanation):
[{"name":"...","description":"...","atmosphere":"..."},...]
- name: 2–4 words, evocative and specific
- description: 1–2 sentences, concrete details
- atmosphere: mood / sensory feel in 5–10 words`,

  factions: `You are a world-building assistant for interactive fiction.
Generate exactly 3 factions for this story, informed by the locations and concept provided.
Return ONLY a JSON array with this exact shape (no markdown, no explanation):
[{"name":"...","ideology":"...","leader":"...","relation":"..."},...]
- name: group name (2–4 words)
- ideology: core belief or goal (1 sentence)
- leader: name and title of the faction's leader
- relation: their stance toward the protagonist (1 sentence)`,

  rules: `You are a world-building assistant for interactive fiction.
Generate exactly 5 world rules / laws / constraints for this story — things that are true about this world and affect what characters can and cannot do. Make them specific, not generic.
Return ONLY a JSON array of strings (no markdown, no explanation):
["Rule one.","Rule two.",...]`,

  lore: `You are a world-building assistant for interactive fiction.
Generate exactly 3 lore entries (historical events, myths, secrets, or legends) for this story. Each must connect to the concept, locations, and factions established.
Return ONLY a JSON array with this exact shape (no markdown, no explanation):
[{"title":"...","content":"..."},...]
- title: 3–6 words
- content: 2–3 sentences of lore`,
};

function buildWorldStepUser(context: Record<string, unknown>): string {
  const { step, genre, title, premise, existingWorld } = context;
  const brief = GENRE_META[genre as keyof typeof GENRE_META]?.brief ?? '';
  let msg = `Genre: ${genre}\nGenre tone: ${brief}\nStory: "${title}"\nConcept: ${premise}`;
  if (existingWorld) {
    const w = existingWorld as Record<string, unknown>;
    if (Array.isArray(w.locations) && w.locations.length > 0) {
      msg += `\n\nLocations established:\n${(w.locations as {name:string}[]).map((l) => `- ${l.name}`).join('\n')}`;
    }
    if (Array.isArray(w.factions) && w.factions.length > 0) {
      msg += `\n\nFactions established:\n${(w.factions as {name:string}[]).map((f) => `- ${f.name}`).join('\n')}`;
    }
  }
  msg += `\n\nGenerate ${step}.`;
  return msg;
}

function buildWorldRecycleUser(context: Record<string, unknown>): string {
  const { step, genre, title, premise, siblings, itemType } = context;
  const brief = GENRE_META[genre as keyof typeof GENRE_META]?.brief ?? '';
  const siblingList = Array.isArray(siblings)
    ? (siblings as string[]).map((s) => `- ${s}`).join('\n')
    : '';
  return `Genre: ${genre}\nGenre tone: ${brief}\nStory: "${title}"\nConcept: ${premise}

Already have these ${step}:
${siblingList}

Generate ONE new ${itemType} that is different from all the above.
Return ONLY the JSON object (no array wrapper, no markdown).`;
}

// ── Dynamic base builders (genre-aware) ──────────────────────────────────────

function dynamicBodyBase(ctx: Record<string, unknown>): string {
  const genre = ctx.genre as string | undefined;
  const title = ctx.storyTitle as string | undefined;
  const brief = ctx.genreBrief as string | undefined;
  const gameDesc = title ? `${title}, a ${genre ?? 'text'} RPG` : `a ${genre ?? 'text'} RPG`;

  let base = `You are a narrative writer for ${gameDesc}.

Write or rewrite scene body text for story nodes in this style:
- Second-person present tense ("You step into…", "The door slides open…")
- Terse, evocative prose — vivid but not overwrought
- Grounded sensory details (light, sound, smell, texture)
- Match the tension and mood of surrounding scenes
- Do NOT include player choices, dialogue options, or meta-commentary
- Return only the scene text`;

  if (brief) base += `\n\nGENRE VOICE: ${brief}`;
  return base;
}

function dynamicLineBase(ctx: Record<string, unknown>): string {
  const genre = ctx.genre as string | undefined;
  const title = ctx.storyTitle as string | undefined;
  const brief = ctx.genreBrief as string | undefined;
  const gameDesc = title ? `${title}, a ${genre ?? 'text'} RPG` : `a ${genre ?? 'text'} RPG`;

  let base = `You are a dialogue writer for ${gameDesc}.

Write a single line of character dialogue:
- Write only the spoken words — no speech tags, no quotation marks, no action descriptions
- Match the character's role, personality, and speech patterns
- Keep it concise — 1–3 sentences maximum
- Match the tension and mood of the surrounding scene
- Use natural speech appropriate to the character's background
- Do NOT include stage directions, action beats, or meta-commentary
- Return only the dialogue text`;

  if (brief) base += `\n\nGENRE VOICE: ${brief}`;
  return base;
}

// ── Context-aware system builders ────────────────────────────────────────────

function buildLineSystem(ctx?: Record<string, unknown>): string {
  if (!ctx) return LINE_SYSTEM_BASE;
  const base = dynamicLineBase(ctx);
  const parts: string[] = [];
  if (ctx.logline) parts.push(`Logline: ${ctx.logline}`);
  if (ctx.nodeTitle)
    parts.push(`Scene: "${ctx.nodeTitle}" [${ctx.nodeType ?? 'story'}${ctx.nodeLocation ? ` · ${ctx.nodeLocation}` : ''}]`);
  if (ctx.nodeMood) parts.push(`Scene mood: ${ctx.nodeMood}`);
  if (ctx.speakingCharacterName)
    parts.push(`Speaking character: "${ctx.speakingCharacterName}"${ctx.speakingCharacterRole ? ` — ${ctx.speakingCharacterRole}` : ''}`);
  if (Array.isArray(ctx.prevNodes) && ctx.prevNodes.length) {
    const prev = ctx.prevNodes as { title: string; body: string }[];
    const summary = prev.map((p) => `"${p.title}": ${(p.body ?? '').slice(0, 150)}`).join('\n  ');
    parts.push(`Recent scenes leading here:\n  ${summary}`);
  }
  const worldParts: string[] = [];
  if (ctx.worldLocations) worldParts.push(`Locations: ${(ctx.worldLocations as string).split('\n').slice(0, 3).join('; ')}`);
  if (ctx.worldRules)     worldParts.push(`World rules: ${(ctx.worldRules as string).split('\n').slice(0, 3).join('; ')}`);
  const contextSection = parts.length ? `\n\nCONTEXT:\n${parts.join('\n')}` : '';
  const worldSection = worldParts.length ? `\n\nWORLD:\n${worldParts.join('\n')}` : '';
  return `${base}${contextSection}${worldSection}`;
}

function buildBodySystem(ctx?: Record<string, unknown>): string {
  if (!ctx) return BODY_SYSTEM_BASE;
  const base = dynamicBodyBase(ctx);
  const parts: string[] = [];
  if (ctx.logline) parts.push(`Logline: ${ctx.logline}`);
  if (ctx.targetTone) parts.push(`Tone: ${ctx.targetTone}`);
  if (ctx.nodeTitle)
    parts.push(
      `Current scene: "${ctx.nodeTitle}" [${ctx.nodeType ?? 'story'}${ctx.nodeLocation ? ` · ${ctx.nodeLocation}` : ''}]`,
    );
  if (ctx.nodeMood) parts.push(`Scene mood: ${ctx.nodeMood}`);
  if (Array.isArray(ctx.characters) && ctx.characters.length) {
    const chars = ctx.characters as { name: string; role: string }[];
    parts.push(`Characters on this path: ${chars.map((c) => `${c.name} (${c.role})`).join(', ')}`);
  }
  if (Array.isArray(ctx.prevNodes) && ctx.prevNodes.length) {
    const prev = ctx.prevNodes as { title: string; body: string }[];
    const summary = prev.map((p) => `"${p.title}": ${(p.body ?? '').slice(0, 150)}`).join('\n  ');
    parts.push(`Ancestral path (recent scenes leading here):\n  ${summary}`);
  }
  if (Array.isArray(ctx.siblings) && ctx.siblings.length) {
    const sibs = ctx.siblings as { title: string; type: string }[];
    parts.push(`Sibling branches: ${sibs.map((s) => `"${s.title}" [${s.type}]`).join(', ')}`);
  }
  if (Array.isArray(ctx.nextNodes) && ctx.nextNodes.length) {
    const next = ctx.nextNodes as { title: string; type: string }[];
    parts.push(`Leads to: ${next.map((n) => `"${n.title}" [${n.type}]`).join(', ')}`);
  }
  if (Array.isArray(ctx.twistNodes) && ctx.twistNodes.length) {
    const twists = ctx.twistNodes as { title: string; body?: string }[];
    parts.push(`Downstream twist anchors (write TOWARD these):\n  ${twists.map((t) => `"${t.title}"${t.body ? `: ${t.body}` : ''}`).join('\n  ')}`);
  }
  const worldParts: string[] = [];
  if (ctx.worldLocations) worldParts.push(`LOCATIONS:\n${ctx.worldLocations}`);
  if (ctx.worldFactions)  worldParts.push(`FACTIONS:\n${ctx.worldFactions}`);
  if (ctx.worldRules)     worldParts.push(`WORLD RULES:\n${ctx.worldRules}`);
  if (ctx.worldLore)      worldParts.push(`LORE:\n${ctx.worldLore}`);
  const contextSection = parts.length ? `\n\nSTORY CONTEXT:\n${parts.join('\n')}` : '';
  const worldSection = worldParts.length ? `\n\nWORLD CONTEXT:\n${worldParts.join('\n')}` : '';
  return `${base}${contextSection}${worldSection}`;
}

function buildAudioSuggestSystem(ctx?: Record<string, unknown>): string {
  if (!ctx) return AUDIO_SUGGEST_SYSTEM;
  const parts: string[] = [];
  if (ctx.genre) parts.push(`Genre: ${ctx.genre}`);
  if (ctx.genreBrief) parts.push(`Genre voice: ${ctx.genreBrief}`);
  if (ctx.logline) parts.push(`Logline: ${ctx.logline}`);
  if (ctx.nodeTitle)
    parts.push(`Scene: "${ctx.nodeTitle}" [${ctx.nodeType ?? 'story'}${ctx.nodeLocation ? ` · ${ctx.nodeLocation}` : ''}]`);
  if (ctx.nodeMood) parts.push(`Scene mood: ${ctx.nodeMood}`);
  if (Array.isArray(ctx.blocks) && ctx.blocks.length) {
    const blocks = ctx.blocks as { index: number; type: string; text: string; characterName?: string }[];
    const blockList = blocks
      .map((b) => `  [${b.index}] ${b.type === 'line' ? `${b.characterName ?? 'unknown'}: ` : ''}${b.text.slice(0, 120)}`)
      .join('\n');
    parts.push(`Scene blocks:\n${blockList}`);
  }
  if (Array.isArray(ctx.prevNodes) && ctx.prevNodes.length) {
    const prev = ctx.prevNodes as { title: string; body: string }[];
    const summary = prev.map((p) => `"${p.title}": ${(p.body ?? '').slice(0, 100)}`).join('\n  ');
    parts.push(`Previous scenes:\n  ${summary}`);
  }
  return parts.length ? `${AUDIO_SUGGEST_SYSTEM}\n\nSCENE CONTEXT:\n${parts.join('\n')}` : AUDIO_SUGGEST_SYSTEM;
}

function buildStoryGenSystem(ctx?: Record<string, unknown>): string {
  const genre = (ctx?.genre as string) ?? 'custom';
  const brief = (ctx?.genreBrief as string) ?? '';
  const cast = ctx?.cast as { name: string; role: string; sketch: string }[] | undefined;
  const worldData = ctx?.worldData as Record<string, unknown> | undefined;

  let sys = STORY_GEN_SYSTEM;
  if (brief) sys += `\n\nGENRE VOICE: ${brief}`;

  if (cast && cast.length > 0) {
    sys += `\n\nESTABLISHED CAST — assign these characters IDs c1, c2, c3… in order and use them as the core cast throughout the story:\n`;
    cast.forEach((c, i) => {
      sys += `c${i + 1}: ${c.name} (${c.role}) — ${c.sketch}\n`;
    });
    sys += `You may add 1–2 minor supporting characters after the established cast if the story requires them.`;
  }

  if (worldData) {
    const locations = worldData.locations as { name: string; description: string; atmosphere: string }[] | undefined;
    const factions = worldData.factions as { name: string; ideology: string; leader: string; relation: string }[] | undefined;
    const rules = worldData.rules as string[] | undefined;
    const lore = worldData.lore as { title: string; content: string }[] | undefined;

    if (locations?.length) {
      sys += `\n\nWORLD LOCATIONS — use these as scene settings, referencing them by name in each node's "location" field:\n`;
      locations.forEach((l) => { sys += `- ${l.name}: ${l.description} · ${l.atmosphere}\n`; });
    }
    if (factions?.length) {
      sys += `\nFACTIONS — weave these into the story as allies, antagonists, or sources of conflict:\n`;
      factions.forEach((f) => { sys += `- ${f.name}: ${f.ideology} Leader: ${f.leader}. ${f.relation}\n`; });
    }
    if (rules?.length) {
      sys += `\nWORLD RULES — these constraints apply to all characters and events:\n`;
      rules.forEach((r) => { sys += `- ${r}\n`; });
    }
    if (lore?.length) {
      sys += `\nLORE — reference these in dialogue or prose to ground the world:\n`;
      lore.forEach((l) => { sys += `- ${l.title}: ${l.content}\n`; });
    }
  }

  sys += `\n\nGenerate a ${genre} interactive fiction story.`;
  return sys;
}

function buildCommandInterpretSystem(ctx?: Record<string, unknown>): string {
  if (!ctx) return COMMAND_INTERPRET_SYSTEM;
  const parts: string[] = [];
  if (ctx.storyTitle) parts.push(`Current story: "${ctx.storyTitle}"`);
  if (ctx.genre) parts.push(`Genre: ${ctx.genre}`);
  if (ctx.selectedNodeTitle) parts.push(`Selected node: "${ctx.selectedNodeTitle}"`);
  if (Array.isArray(ctx.characterNames) && ctx.characterNames.length) {
    parts.push(`Existing characters: ${(ctx.characterNames as string[]).join(', ')}`);
  }
  return parts.length
    ? `${COMMAND_INTERPRET_SYSTEM}\n\nCONTEXT:\n${parts.join('\n')}`
    : COMMAND_INTERPRET_SYSTEM;
}

function buildSfxSuggestSystem(ctx?: Record<string, unknown>): string {
  if (!ctx) return SFX_SUGGEST_SYSTEM;
  const parts: string[] = [];
  if (ctx.genre) parts.push(`Genre: ${ctx.genre}`);
  if (ctx.logline) parts.push(`Logline: ${ctx.logline}`);
  if (ctx.nodeTitle)
    parts.push(`Scene: "${ctx.nodeTitle}" [${ctx.nodeType ?? 'story'}${ctx.nodeLocation ? ` · ${ctx.nodeLocation}` : ''}]`);
  if (ctx.nodeMood) parts.push(`Scene mood: ${ctx.nodeMood}`);
  if (ctx.blockType) parts.push(`Block type: ${ctx.blockType}`);
  if (ctx.characterName) parts.push(`Speaking character: ${ctx.characterName}`);
  if (ctx.wordCount) parts.push(`Word count: ${ctx.wordCount}`);
  return parts.length ? `${SFX_SUGGEST_SYSTEM}\n\nCONTEXT:\n${parts.join('\n')}` : SFX_SUGGEST_SYSTEM;
}

// ── User message builders ─────────────────────────────────────────────────────

function buildAvatarPromptUser(ctx?: Record<string, unknown>): string {
  const parts: string[] = [];
  if (ctx?.name) parts.push(`Name: ${ctx.name}`);
  if (ctx?.role) parts.push(`Role: ${ctx.role}`);
  if (ctx?.backstory) parts.push(`Backstory: ${ctx.backstory}`);
  if (ctx?.traits) parts.push(`Traits: ${ctx.traits}`);
  return parts.length
    ? `Generate a portrait prompt for this character:\n${parts.join('\n')}`
    : 'Generate a generic character portrait prompt.';
}

function buildLoomAnalyseUser(ctx?: Record<string, unknown>): string {
  if (!ctx) return 'Analyse this story node.';
  const lines: string[] = [];

  lines.push(`STORY: "${ctx.storyTitle ?? 'Untitled'}" [${ctx.genre ?? 'unknown genre'}]`);
  if (ctx.logline) lines.push(`Logline: ${ctx.logline}`);
  if (ctx.totalNodes) lines.push(`Total nodes: ${ctx.totalNodes} | Characters: ${ctx.totalCharacters ?? 0} | End nodes: ${ctx.totalEndNodes ?? 0} | Twists: ${ctx.twistCount ?? 0} | Branch nodes: ${ctx.branchCount ?? 0}`);

  lines.push(`\nCURRENT NODE: "${ctx.nodeTitle ?? '?'}" [${ctx.nodeType ?? 'story'}${ctx.nodeLocation ? ` · ${ctx.nodeLocation}` : ''}]`);
  if (ctx.nodeBody) lines.push(`Content: ${(ctx.nodeBody as string).slice(0, 300)}`);
  if (Array.isArray(ctx.nodeChoices) && ctx.nodeChoices.length > 0) {
    const choices = ctx.nodeChoices as {label: string; next?: string}[];
    lines.push(`Choices: ${choices.map((c) => `"${c.label}" → ${c.next ? `node ${c.next}` : 'DEAD END'}`).join(' | ')}`);
  }
  if (Array.isArray(ctx.deadEndChoices) && ctx.deadEndChoices.length > 0) {
    lines.push(`⚠ Dead-end choices (no target): ${(ctx.deadEndChoices as string[]).join(', ')}`);
  }
  if (ctx.chainLength) lines.push(`Linear run length since last branch/twist: ${ctx.chainLength} nodes`);

  if (Array.isArray(ctx.orphanNodes) && ctx.orphanNodes.length > 0) {
    lines.push(`\nOrphaned nodes (no incoming edges): ${(ctx.orphanNodes as string[]).join(', ')}`);
  }
  if (ctx.longestChain) lines.push(`Longest linear chain in story: ${ctx.longestChain} nodes`);

  if (Array.isArray(ctx.prevNodes) && ctx.prevNodes.length > 0) {
    const prev = ctx.prevNodes as {title: string; body?: string}[];
    lines.push(`\nPath to this scene:\n${prev.map((p) => `  → "${p.title}": ${(p.body ?? '').slice(0, 100)}`).join('\n')}`);
  }

  if (Array.isArray(ctx.characters) && ctx.characters.length > 0) {
    const chars = ctx.characters as {name: string; role: string; id: string}[];
    lines.push(`\nCHARACTERS:\n${chars.map((c) => `  ${c.name} [${c.role}] (id: ${c.id})`).join('\n')}`);
  }
  if (Array.isArray(ctx.characterFrequency) && ctx.characterFrequency.length > 0) {
    const freq = ctx.characterFrequency as {name: string; count: number}[];
    lines.push(`Appearances per character: ${freq.map((f) => `${f.name}=${f.count}`).join(', ')}`);
  }
  if (Array.isArray(ctx.characterAbsentSince) && ctx.characterAbsentSince.length > 0) {
    const absent = ctx.characterAbsentSince as {name: string; nodesSince: number; characterId: string}[];
    lines.push(`Characters absent > 3 nodes: ${absent.map((a) => `${a.name} (${a.nodesSince} nodes, id: ${a.characterId})`).join(', ')}`);
  }

  if (ctx.worldLocations) lines.push(`\nWorld locations: ${ctx.worldLocations}`);
  if (ctx.worldFactions) lines.push(`World factions: ${ctx.worldFactions}`);
  if (ctx.worldRules) lines.push(`World rules: ${(ctx.worldRules as string).slice(0, 300)}`);
  if (Array.isArray(ctx.missingWorldDefs) && ctx.missingWorldDefs.length > 0) {
    lines.push(`⚠ References in text not defined in world: ${(ctx.missingWorldDefs as string[]).join(', ')}`);
  }

  return lines.join('\n');
}

function buildLoomChatUser(ctx?: Record<string, unknown>, prompt?: string): string {
  const question = prompt?.trim() || 'What can you tell me about this scene?';
  if (!ctx) return question;
  const summary = [
    `Story: "${ctx.storyTitle ?? 'Untitled'}" [${ctx.genre ?? 'unknown'}]`,
    ctx.logline ? `Logline: ${ctx.logline}` : null,
    `Current scene: "${ctx.nodeTitle ?? '?'}" [${ctx.nodeType ?? 'story'}]`,
    ctx.nodeBody ? `Content: ${(ctx.nodeBody as string).slice(0, 200)}` : null,
    Array.isArray(ctx.characters) && ctx.characters.length > 0
      ? `Characters: ${(ctx.characters as {name: string; role: string}[]).map((c) => `${c.name} (${c.role})`).join(', ')}`
      : null,
  ].filter(Boolean).join('\n');
  return `${summary}\n\nWriter's question: ${question}`;
}

// ── Seed AI prompts ──────────────────────────────────────────────────────────

const SEED_SPARK_SYSTEM = `You are a creative collaborator helping a writer find the emotional core of their story idea.
Respond in exactly 2 sentences. First sentence: reflect the emotional feeling or atmosphere they described, using evocative language — not a plot summary. Second sentence: optionally suggest a different genre if their idea sounds like it fits one strongly (e.g. "This feels more fantasy than sci-fi"). If their genre feels right, omit the second sentence.
Never mention craft terminology, story structure, or writing advice. Pure feeling only.`;

function buildSeedPremiseSystem(ctx?: Record<string, unknown>): string {
  const genre = (ctx?.genre as string | undefined) ?? 'sci-fi';
  const genreMeta = GENRE_META[genre as keyof typeof GENRE_META];
  const brief = genreMeta?.brief ?? '';
  return `You are helping a writer develop the core premise of their interactive story.
Generate exactly 3 distinct premise options in the format: [who] wants [what] but [obstacle].
Each premise should feel dramatically distinct — not variations of the same idea.
${brief ? `Genre brief: ${brief}` : ''}
Return JSON only. No preamble, no markdown fences.
Format: { "options": [{ "who": "...", "wants": "...", "but": "...", "fullText": "..." }, ...] }
fullText is the combined natural-language premise sentence.`;
}

const SEED_WORLDCAST_SYSTEM = `You are helping a writer build the world and characters for their interactive story.
Given the locked premise, generate:
- 5 to 7 world facts: specific, concrete single-sentence truths about this world (rules, textures, what people fear, social dynamics)
- 2 to 4 characters: each with name, role, wound (their core damage/flaw), and want (what they're pursuing)
The wound and want should create dramatic tension — the gap between them is where complexity lives.
Never use dramatic theory terminology. Keep everything concrete and human.
Return JSON only. No preamble, no markdown fences.
Format: { "worldFacts": ["...", ...], "characters": [{ "name": "...", "role": "...", "wound": "...", "want": "..." }, ...] }`;

const SEED_ARCHITECTURE_SYSTEM = `You are helping a writer plan the narrative architecture of their interactive story.
Given the premise, world, and characters, generate:
- 3 to 5 acts: each with a label (2-5 words describing the dramatic phase, NOT "Act 1") and emotionalBeat (the core emotional experience of this phase)
- 3 to 5 jaw-drop moments: specific dramatic events that will surprise or move the reader, each with title (5-8 words), description (1-2 sentences), and position (early, middle, or late in the story)
Jaw-drop moments must be specific to the premise and characters — not generic thriller beats.
Return JSON only. No preamble, no markdown fences.
Format: { "acts": [{ "label": "...", "emotionalBeat": "..." }, ...], "moments": [{ "title": "...", "description": "...", "position": "early" | "middle" | "late" }, ...] }`;

function buildSeedSparkUser(ctx?: Record<string, unknown>, prompt?: string): string {
  const genre = (ctx?.genre as string | undefined) ?? 'sci-fi';
  return `Genre: ${genre}\n\nWriter's idea:\n${prompt?.trim() || '(nothing written yet)'}`;
}

function buildSeedPremiseUser(ctx?: Record<string, unknown>, prompt?: string): string {
  const lines: string[] = [];
  if (ctx?.genre) lines.push(`Genre: ${ctx.genre}`);
  if (ctx?.sparkReflection) lines.push(`Spark reflection: ${ctx.sparkReflection}`);
  if (prompt?.trim()) lines.push(`Writer's original spark: ${prompt.trim()}`);
  return lines.join('\n') || 'Generate 3 premise options for a story.';
}

function buildSeedWorldcastUser(ctx?: Record<string, unknown>): string {
  const lines: string[] = [];
  if (ctx?.genre) lines.push(`Genre: ${ctx.genre}`);
  if (ctx?.premise) lines.push(`Locked premise: ${ctx.premise}`);
  return lines.join('\n') || 'Generate world facts and characters for this story.';
}

function buildSeedArchitectureUser(ctx?: Record<string, unknown>): string {
  const lines: string[] = [];
  if (ctx?.genre) lines.push(`Genre: ${ctx.genre}`);
  if (ctx?.premise) lines.push(`Premise: ${ctx.premise}`);
  if (Array.isArray(ctx?.worldFacts) && (ctx.worldFacts as string[]).length > 0) {
    lines.push(`World facts:\n${(ctx.worldFacts as string[]).map((f) => `  - ${f}`).join('\n')}`);
  }
  if (Array.isArray(ctx?.characters) && (ctx.characters as unknown[]).length > 0) {
    const chars = ctx.characters as { name: string; role: string; wound: string; want: string }[];
    lines.push(`Characters:\n${chars.map((c) => `  - ${c.name} (${c.role}): wound="${c.wound}", want="${c.want}"`).join('\n')}`);
  }
  return lines.join('\n') || 'Generate narrative architecture for this story.';
}

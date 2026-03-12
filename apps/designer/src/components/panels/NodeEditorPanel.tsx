'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { NWVNode, NWVBlock, NWVChoice, NWVStory, StatType, NodeType, NWVCharacter } from '@nodeweaver/engine';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';
import { charSeed } from '@/lib/char-seed';
import { buildAIContext, aiContextToFlat } from '@/lib/context-builder';

// ── Helpers ─────────────────────────────────────────────────────────────────

const NODE_TYPE_COLOURS: Record<NodeType, string> = {
  story:  '#3b82f6',
  combat: '#ef4444',
  chat:   '#22c55e',
  twist:  '#a855f7',
  start:  '#14b8a6',
  end:    '#f97316',
};

const STAT_TYPES: StatType[] = ['neutral', 'str', 'wit', 'charm'];
const STAT_LABELS: Record<StatType, string> = {
  neutral: 'Neutral',
  str: 'STR',
  wit: 'WIT',
  charm: 'CHM',
};

const NODE_TYPE_ITEMS: { type: NodeType; label: string }[] = [
  { type: 'story',  label: 'Story' },
  { type: 'chat',   label: 'Chat' },
  { type: 'combat', label: 'Interactive' },
  { type: 'twist',  label: 'Twist' },
  { type: 'start',  label: 'Start' },
  { type: 'end',    label: 'End' },
];

// ── TTS dropdown options ─────────────────────────────────────────────────────

const EMOTION_OPTIONS = [
  'neutral', 'happy', 'sad', 'angry', 'fearful', 'surprised', 'excited',
  'tender', 'anxious', 'melancholic', 'curious', 'determined', 'amused', 'contemptuous',
].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

const TONE_OPTIONS = [
  'calm', 'whispering', 'shouting', 'urgent', 'sarcastic', 'monotone', 'cheerful',
  'somber', 'authoritative', 'hesitant', 'pleading', 'threatening', 'gentle', 'cold',
].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

const VOICE_TEXTURE_OPTIONS = [
  'breathy', 'strained', 'gravelly', 'husky', 'nasal', 'raspy',
  'smooth', 'trembling', 'crisp', 'soft', 'throaty', 'clear',
].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

// ── Choice card ──────────────────────────────────────────────────────────────

function ChoiceCard({
  choice,
  nodeId,
  allNodes,
}: {
  choice: NWVChoice;
  nodeId: string;
  allNodes: NWVNode[];
}) {
  const { updateChoice, deleteChoice } = useStoryStore();
  const [expanded, setExpanded] = useState(false);

  const up = (patch: Partial<NWVChoice>) => updateChoice(nodeId, choice.id, patch);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50">
      {/* Choice header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          className="shrink-0 text-slate-400 hover:text-slate-700"
          onClick={() => setExpanded((x) => !x)}
          aria-label="Toggle choice"
        >
          {expanded ? '▾' : '▸'}
        </button>

        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          placeholder="Choice label…"
          value={choice.label}
          onChange={(e) => up({ label: e.target.value })}
        />

        {/* Stat type pill */}
        <select
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-600 focus:outline-none"
          value={choice.type}
          onChange={(e) => up({ type: e.target.value as StatType })}
        >
          {STAT_TYPES.map((t) => (
            <option key={t} value={t}>{STAT_LABELS[t]}</option>
          ))}
        </select>

        <button
          className="shrink-0 text-slate-400 hover:text-red-500"
          onClick={() => deleteChoice(nodeId, choice.id)}
          aria-label="Delete choice"
        >
          ✕
        </button>
      </div>

      {/* Expanded fields */}
      {expanded && (
        <div className="border-t border-slate-200 px-3 py-3 space-y-3">
          {/* Next node */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Next node</label>
            <select
              className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none"
              value={choice.next ?? ''}
              onChange={(e) => up({ next: e.target.value || undefined })}
            >
              <option value="">— none —</option>
              {allNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title || n.id} ({n.type})
                </option>
              ))}
            </select>
          </div>

          {/* Flavour */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Flavour text</label>
            <input
              className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
              placeholder="Brief beat shown on canvas edge…"
              value={choice.flavour ?? ''}
              onChange={(e) => up({ flavour: e.target.value || undefined })}
            />
          </div>

          {/* Consequence */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Consequence</label>
            <textarea
              rows={2}
              className="w-full resize-none rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
              placeholder="Shown between choice and next scene…"
              value={choice.consequence ?? ''}
              onChange={(e) => up({ consequence: e.target.value || undefined })}
            />
            {choice.consequence && (
              <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={choice.positiveConsequence ?? false}
                  onChange={(e) => up({ positiveConsequence: e.target.checked })}
                  className="accent-green-500"
                />
                Positive consequence
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sortable block wrapper for side panel ────────────────────────────────────

function SortableBlockCard({ id, nodeId, children }: { id: string; nodeId: string; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { nodeId, blockId: id.replace(/^panel-/, '') } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 rounded-l"
        title="Drag to reorder or move to another node"
      >
        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
          <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
          <circle cx="2" cy="7" r="1.2" /><circle cx="6" cy="7" r="1.2" />
          <circle cx="2" cy="12" r="1.2" /><circle cx="6" cy="12" r="1.2" />
        </svg>
      </button>
      <div className="ml-5">{children}</div>
    </div>
  );
}

// ── Block editor ─────────────────────────────────────────────────────────────

function BlockEditor({
  blocks,
  nodeId,
  characters,
  defaultCharacterId,
  readingBlockId,
  anthropicKey,
  context,
  onPlayBlock,
}: {
  blocks: NWVBlock[];
  nodeId: string;
  characters: NWVCharacter[];
  defaultCharacterId?: string;
  readingBlockId: string | null;
  anthropicKey: string;
  context: Record<string, unknown>;
  onPlayBlock: (blockId: string) => void;
}) {
  const { addBlock, updateBlock, deleteBlock, moveBlock } = useStoryStore();
  const [aiLoadingBlockId, setAiLoadingBlockId] = useState<string | null>(null);
  // Local streaming text — avoids hammering the store on every chunk
  const [streamingText, setStreamingText] = useState<{ blockId: string; text: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  async function handleAiBlock(block: NWVBlock) {
    setAiLoadingBlockId(block.id);
    setAiError(null);
    const speakingChar = characters.find(
      (c) => c.id === (block.characterId || defaultCharacterId),
    );
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: block.type === 'line' ? 'line' : 'body',
        prompt: block.text.trim(),
        anthropicKey,
        context: {
          ...context,
          speakingCharacterName: speakingChar?.name,
          speakingCharacterRole: speakingChar?.role,
        },
      }),
    }).catch(() => null);

    if (!res?.ok || !res.body) {
      // Surface the actual error message from the API
      const errRaw = res ? await res.text().catch(() => null) : null;
      let errMsg = 'AI generation failed.';
      try {
        if (errRaw) {
          const parsed = JSON.parse(errRaw);
          if (parsed.error) errMsg = typeof parsed.error === 'string' ? parsed.error : (parsed.error.message ?? errMsg);
        }
      } catch { /* not JSON */ }
      setAiError(errMsg);
      setAiLoadingBlockId(null);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        // Show live text in local state — no store writes during streaming
        setStreamingText({ blockId: block.id, text: accumulated });
      }
      // Single store write + persist when streaming is complete
      if (accumulated) updateBlock(nodeId, block.id, { text: accumulated });
    } finally {
      setStreamingText(null);
      setAiLoadingBlockId(null);
    }
  }

  const sortableIds = useMemo(
    () => blocks.map((b) => `panel-${b.id}`),
    [blocks],
  );

  return (
    <div className="space-y-2">
      {blocks.length === 0 && (
        <p className="text-xs italic text-slate-400">No content yet. Add a prose or dialogue block below.</p>
      )}

      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      {blocks.map((block, idx) => {
        const isPlaying = readingBlockId === block.id;
        const isProse = block.type === 'prose';
        const isAiLoading = aiLoadingBlockId === block.id;
        const liveText = streamingText?.blockId === block.id ? streamingText.text : null;

        // Resolve the speaking character for voice-status display
        const resolvedCharId = block.characterId || defaultCharacterId || 'narrator';
        const resolvedChar = characters.find((c) => c.id === resolvedCharId);
        const hasVoice = !!resolvedChar?.qwenInstruct?.trim();

        return (
          <SortableBlockCard key={block.id} id={`panel-${block.id}`} nodeId={nodeId}>
          <div
            className="rounded border transition-colors"
            style={
              isPlaying
                ? { borderColor: '#c4b5fd', backgroundColor: '#f5f3ff' }
                : isProse
                ? { borderColor: '#e2e8f0', backgroundColor: '#ffffff' }
                : { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }
            }
          >
            {/* Header row: type label · char picker · controls */}
            <div className="flex items-center gap-1.5 px-2 pt-1.5">

              {/* Type selector */}
              <select
                className={`shrink-0 cursor-pointer rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide focus:outline-none ${
                  isProse ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-violet-200 bg-violet-100 text-violet-700'
                }`}
                value={block.type}
                onChange={(e) => updateBlock(nodeId, block.id, { type: e.target.value as 'prose' | 'line' })}
              >
                <option value="prose">prose</option>
                <option value="line">line</option>
              </select>

              {/* Character picker — 96px wide, amber when no voice */}
              <div className="relative w-24 shrink-0">
                <select
                  className={`w-full rounded border px-1.5 py-0.5 text-xs focus:outline-none ${
                    hasVoice
                      ? 'border-slate-200 bg-white text-slate-700'
                      : 'border-amber-300 bg-amber-50 text-amber-800'
                  }`}
                  value={block.characterId ?? ''}
                  onChange={(e) => updateBlock(nodeId, block.id, { characterId: e.target.value || undefined })}
                  title={hasVoice ? `${resolvedChar?.name} — voice set` : 'No voice — will be skipped during playback'}
                >
                  <option value="">Default</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {!hasVoice && (
                  <span className="pointer-events-none absolute -right-1 -top-1 text-[9px] leading-none text-amber-500">⚠</span>
                )}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Controls */}
              <div className="flex items-center gap-1">
                {/* AI button — all block types */}
                <button
                  onClick={() => handleAiBlock(block)}
                  disabled={isAiLoading}
                  title={isProse ? 'Write / improve prose with AI' : 'Write dialogue with AI'}
                  className={`rounded px-1 py-0.5 text-[9px] font-semibold transition-colors ${
                    isAiLoading
                      ? 'bg-violet-100 text-violet-500 cursor-wait'
                      : 'bg-violet-50 text-violet-500 hover:bg-violet-100 hover:text-violet-700'
                  }`}
                >
                  {isAiLoading ? '…' : 'AI'}
                </button>
                <button
                  onClick={() => onPlayBlock(block.id)}
                  title="Play this block"
                  className="text-[10px] text-violet-400 hover:text-violet-700"
                >▶</button>
                <button
                  onClick={() => moveBlock(nodeId, block.id, 'up')}
                  disabled={idx === 0}
                  className="text-[10px] text-slate-300 hover:text-slate-600 disabled:opacity-30"
                >▲</button>
                <button
                  onClick={() => moveBlock(nodeId, block.id, 'down')}
                  disabled={idx === blocks.length - 1}
                  className="text-[10px] text-slate-300 hover:text-slate-600 disabled:opacity-30"
                >▼</button>
                <button
                  onClick={() => deleteBlock(nodeId, block.id)}
                  className="text-[10px] text-slate-300 hover:text-red-500"
                >✕</button>
              </div>
            </div>

            {/* Text area */}
            <div className="px-2 pt-1">
              <textarea
                rows={isProse ? 4 : 2}
                className={`w-full bg-transparent text-xs text-slate-900 placeholder-slate-400 focus:outline-none ${isProse ? 'resize-y' : 'resize-none'} ${isAiLoading ? 'text-violet-700' : ''}`}
                placeholder={isProse ? 'Narrative text…' : 'Dialogue…'}
                value={liveText ?? block.text}
                readOnly={isAiLoading}
                onChange={(e) => { if (!isAiLoading) updateBlock(nodeId, block.id, { text: e.target.value }); }}
              />
            </div>

            {/* Per-block TTS controls */}
            <div className="flex gap-1.5 border-t border-slate-100 px-2 pb-1.5 pt-1">
              <select
                className="flex-1 min-w-0 bg-transparent text-[10px] text-slate-400 focus:text-slate-700 focus:outline-none cursor-pointer"
                value={block.emotion ?? ''}
                onChange={(e) => updateBlock(nodeId, block.id, { emotion: e.target.value || undefined })}
              >
                <option value="">Emotion…</option>
                {EMOTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                className="flex-1 min-w-0 bg-transparent text-[10px] text-slate-400 focus:text-slate-700 focus:outline-none cursor-pointer"
                value={block.tone ?? ''}
                onChange={(e) => updateBlock(nodeId, block.id, { tone: e.target.value || undefined })}
              >
                <option value="">Tone…</option>
                {TONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                className="flex-1 min-w-0 bg-transparent text-[10px] text-slate-400 focus:text-slate-700 focus:outline-none cursor-pointer"
                value={block.voiceTexture ?? ''}
                onChange={(e) => updateBlock(nodeId, block.id, { voiceTexture: e.target.value || undefined })}
              >
                <option value="">Voice…</option>
                {VOICE_TEXTURE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          </SortableBlockCard>
        );
      })}
      </SortableContext>

      {/* Add block buttons */}
      <div className="flex gap-2">
        <button
          className="flex-1 rounded border border-dashed border-slate-300 py-1 text-xs text-slate-400 transition hover:border-slate-400 hover:text-slate-600"
          onClick={() => addBlock(nodeId, 'prose')}
        >
          + Prose
        </button>
        <button
          className="flex-1 rounded border border-dashed border-violet-300 py-1 text-xs text-violet-400 transition hover:border-violet-400 hover:text-violet-600"
          onClick={() => addBlock(nodeId, 'line', defaultCharacterId)}
        >
          + Line
        </button>
      </div>

      {/* AI error */}
      {aiError && (
        <p className="rounded bg-red-50 px-2 py-1 text-[10px] text-red-600">
          ⚠ {aiError}
        </p>
      )}
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

interface PanelSizeProps {
  panelWidth: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function NodeEditorPanel({ panelWidth, isExpanded, onToggleExpand, onResizeStart }: PanelSizeProps) {
  const {
    activeStory,
    selectedNodeId,
    setSelectedNode,
    updateNode,
    deleteNode,
    addChoice,
  } = useStoryStore();
  const { anthropicKey } = useSettingsStore();

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const typePickerRef = useRef<HTMLDivElement>(null);

  // Close type picker on outside click / Escape
  useEffect(() => {
    if (!typePickerOpen) return;
    const onMouse = (e: MouseEvent) => {
      if (typePickerRef.current && !typePickerRef.current.contains(e.target as globalThis.Element)) setTypePickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTypePickerOpen(false); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey); };
  }, [typePickerOpen]);

  // Voice reading state
  const [reading, setReading] = useState(false);
  const [readingBlockId, setReadingBlockId] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const readAbortRef = useRef<{ stop: boolean }>({ stop: false });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scheduledEndRef = useRef<number>(0);
  const activeNodesRef = useRef<AudioBufferSourceNode[]>([]);
  // Resolves when the last scheduled audio node fires onended (or stop() is called).
  const lastEndedRef = useRef<Promise<void>>(Promise.resolve());
  const streamCtrlRef = useRef<AbortController | null>(null);

  // Stop reading when node changes or panel unmounts
  useEffect(() => {
    return () => {
      readAbortRef.current.stop = true;
      streamCtrlRef.current?.abort();
      activeNodesRef.current.forEach(n => { try { n.stop(); } catch (_) {} });
      activeNodesRef.current = [];
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, [selectedNodeId]);

  if (!activeStory || !selectedNodeId) return null;

  const node = activeStory.nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const colour = NODE_TYPE_COLOURS[node.type];
  const up = (patch: Partial<NWVNode>) => updateNode(selectedNodeId, patch);
  const blocks = node.blocks ?? [];

  // ── Voice reading (Web Audio streaming — matches game's approach) ────────────

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      scheduledEndRef.current = 0;
      activeNodesRef.current = [];
      lastEndedRef.current = Promise.resolve();
    }
    return audioCtxRef.current;
  }

  async function scheduleAudioBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
    const ctx = getAudioCtx();
    try {
      const buf = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime + 0.005, scheduledEndRef.current);
      scheduledEndRef.current = startAt + buf.duration;
      source.start(startAt);
      activeNodesRef.current.push(source);
      // Event-driven end detection: resolves when this node truly finishes
      // (also fires when stop() is called, so Stop button works correctly).
      lastEndedRef.current = new Promise<void>((resolve) => {
        source.onended = () => {
          activeNodesRef.current = activeNodesRef.current.filter(n => n !== source);
          resolve();
        };
      });
    } catch (_) {}
  }

  // Wait for the last scheduled audio node to fire its onended event.
  // This is purely event-driven — no clocks, no polling, no time math.
  // Works correctly when stop() is called because stop() also fires onended.
  function waitForScheduledEnd(): Promise<void> {
    return lastEndedRef.current;
  }

  function stopReading() {
    readAbortRef.current.stop = true;
    streamCtrlRef.current?.abort();
    activeNodesRef.current.forEach(n => { try { n.stop(); } catch (_) {} });
    activeNodesRef.current = [];
    scheduledEndRef.current = 0;
    setReading(false);
    setReadingBlockId(null);
  }

  async function streamQwenLine(
    text: string,
    character: NWVCharacter,
    opts?: { emotion?: string; tone?: string; voiceTexture?: string },
  ): Promise<boolean> {
    // Capture the abort object for THIS session at call time.
    // If handleReadBlock later replaces readAbortRef.current with a new object,
    // we still check the original one — avoiding a race where a new session's
    // stop=false would let this stale call keep running.
    const abort = readAbortRef.current;
    if (!text.trim() || abort.stop) return false;

    // Per-block values override character defaults
    const emotion = opts?.emotion || character.defaultEmotion;
    const tone = opts?.tone || character.defaultTone;
    const voiceTexture = opts?.voiceTexture || character.defaultVoiceTexture;
    let tags = '';
    if (emotion) tags += `[Emotional: ${emotion}] `;
    if (tone) tags += `[Tone: ${tone}] `;
    if (voiceTexture) tags += `[Voice: ${voiceTexture}] `;
    const instruct = (character.qwenInstruct ?? '') + (tags ? ' ' + tags.trim() : '');

    const ctrl = new AbortController();
    streamCtrlRef.current = ctrl;

    let res: Response;
    try {
      res = await fetch('/api/qwen/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          instruct,
          seed: charSeed(character.id),
          temperature: 0.7,
          streaming_interval: 0.32,
          max_tokens: 2000,
        }),
        signal: ctrl.signal,
      });
    } catch { return false; }

    if (!res.ok || !res.body || abort.stop) {
      if (!abort.stop && !res.ok) setReadError(`TTS unavailable (${res.status}) — is Qwen running on port 7862?`);
      return false;
    }

    const reader = res.body.getReader();
    let buf = new Uint8Array(0);

    while (true) {
      if (abort.stop) { reader.cancel(); return false; }
      let done: boolean; let value: Uint8Array | undefined;
      try { ({ done, value } = await reader.read()); } catch { return false; }
      if (done) break;
      if (value) {
        const tmp = new Uint8Array(buf.length + value.length);
        tmp.set(buf); tmp.set(value, buf.length); buf = tmp;
      }
      // Consume length-prefixed WAV packets: [4-byte big-endian len][WAV bytes]
      while (buf.length >= 4) {
        const len = new DataView(buf.buffer, buf.byteOffset).getUint32(0, false);
        if (buf.length < 4 + len) break;
        const wavBuf = buf.slice(4, 4 + len).buffer;
        buf = buf.slice(4 + len);
        if (!abort.stop) await scheduleAudioBuffer(wavBuf);
      }
    }

    // Wait for this block's audio to finish before returning, so blocks play
    // in clean sequence — matching the behaviour of each individual play button.
    if (!abort.stop) await waitForScheduledEnd();
    return !abort.stop;
  }

  async function handleRead() {
    if (reading) { stopReading(); return; }
    if (!node || !activeStory) return;

    if (blocks.length === 0) {
      setReadError('No content to read.');
      return;
    }

    setReadError(null);
    readAbortRef.current = { stop: false };
    const abort = readAbortRef.current;
    setReading(true);

    const _ctx = getAudioCtx();
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});

    const NARRATOR: NWVCharacter = { id: 'narrator', name: 'Narrator', role: '', backstory: '', traits: '', qwenInstruct: 'A calm, measured narrator with a clear, neutral voice.' };

    for (const block of blocks) {
      if (abort.stop || !block.text?.trim()) continue;
      const charId = block.characterId || node.character || 'narrator';
      const character = activeStory.characters.find((c) => c.id === charId) ?? NARRATOR;
      setReadingBlockId(block.id);
      await streamQwenLine(block.text, character, { emotion: block.emotion, tone: block.tone, voiceTexture: block.voiceTexture });
      if (abort.stop) break;
    }

    if (!abort.stop) {
      setReading(false);
      setReadingBlockId(null);
    }
  }

  async function handleReadBlock(blockId: string) {
    if (!node || !activeStory) return;
    if (reading || readingBlockId !== null) stopReading();

    const block = blocks.find((b) => b.id === blockId);
    if (!block?.text.trim()) return;

    const charId = block.characterId || node.character || 'narrator';
    const character = activeStory.characters.find((c) => c.id === charId);
    if (!character) {
      setReadError('No voice set for this character.');
      return;
    }

    setReadError(null);
    readAbortRef.current = { stop: false };
    setReading(true);
    setReadingBlockId(blockId);

    // Resume AudioContext before first await (still in user-gesture context)
    const _ctx = getAudioCtx();
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});

    await streamQwenLine(block.text, character, { emotion: block.emotion, tone: block.tone, voiceTexture: block.voiceTexture });

    if (!readAbortRef.current.stop) {
      setReading(false);
      setReadingBlockId(null);
    }
  }

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-slate-200 bg-white"
      style={{ width: panelWidth, borderLeftColor: `${colour}44` }}
    >
      {/* Resize handle — left edge */}
      <div
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-violet-300"
        onMouseDown={onResizeStart}
        title="Drag to resize"
      />

      {/* Panel header */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        {/* Clickable type badge with dropdown */}
        <div className="relative" ref={typePickerRef}>
          <button
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: colour }}
            onClick={() => setTypePickerOpen((o) => !o)}
            title="Change node type"
          >
            {node.type === 'combat' ? 'interactive' : node.type}
            <span className="text-[8px] opacity-70">▾</span>
          </button>
          {typePickerOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
              {NODE_TYPE_ITEMS.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => { up({ type }); setTypePickerOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50 ${
                    type === node.type ? 'bg-slate-100' : ''
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: NODE_TYPE_COLOURS[type] }}
                  />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="flex-1 truncate font-mono text-xs text-slate-500">{node.id.slice(0, 8)}…</span>

        {/* Lock toggle */}
        <button
          className={`rounded px-2 py-1 text-xs transition-colors ${
            node.locked
              ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          }`}
          onClick={() => up({ locked: !node.locked })}
          title={node.locked ? 'Unlock node (allow editing)' : 'Lock node (prevent edits & deletion)'}
        >
          {node.locked ? 'Locked' : 'Lock'}
        </button>

        {/* Delete — hidden when locked */}
        {!node.locked && (
          <button
            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
            onClick={() => deleteNode(selectedNodeId)}
          >
            Delete
          </button>
        )}
        <button
          onClick={onToggleExpand}
          className="ml-1 text-slate-400 hover:text-slate-900"
          aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? '⤡' : '⤢'}
        </button>
        <button
          className="ml-1 text-slate-400 hover:text-slate-900"
          onClick={() => setSelectedNode(null)}
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body — pointer-events disabled when locked */}
      <div className={`flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-white ${node.locked ? 'pointer-events-none opacity-60' : ''}`}>

        {/* Title */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">Title</label>
          <input
            className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': colour } as React.CSSProperties}
            placeholder="Scene title…"
            value={node.title ?? ''}
            onChange={(e) => up({ title: e.target.value })}
          />
        </div>

        {/* Location */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">Location</label>
          <input
            className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': colour } as React.CSSProperties}
            placeholder="Station · Sector"
            value={node.location ?? ''}
            onChange={(e) => up({ location: e.target.value })}
          />
        </div>

        {/* Content blocks */}
        <div>
          {/* Section header */}
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Content</span>
            <button
              onClick={handleRead}
              title={reading ? 'Stop playback' : 'Read all blocks with character voices'}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                reading
                  ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                  : 'text-violet-500 hover:bg-violet-50 hover:text-violet-700'
              }`}
            >
              {reading ? '⏹ Stop' : '▶ Read'}
            </button>
          </div>

          <BlockEditor
            blocks={blocks}
            nodeId={selectedNodeId}
            characters={activeStory.characters}
            defaultCharacterId={node.character}
            readingBlockId={readingBlockId}
            anthropicKey={anthropicKey}
            context={aiContextToFlat(buildAIContext(activeStory, selectedNodeId), activeStory, selectedNodeId)}
            onPlayBlock={handleReadBlock}
          />

          {readError && <p className="mt-1.5 text-xs text-red-500">{readError}</p>}
        </div>

        {/* Choices — hidden for terminal end nodes */}
        {node.type !== 'end' && (
          <div className="border-t border-slate-200 pt-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Choices ({node.choices.length})
            </p>

            {node.choices.length === 0 && (
              <p className="mb-3 text-xs text-slate-400">
                No choices yet. Add one or drag from a handle to connect nodes.
              </p>
            )}

            <div className="space-y-2">
              {node.choices.map((choice) => (
                <ChoiceCard
                  key={choice.id}
                  choice={choice}
                  nodeId={node.id}
                  allNodes={activeStory.nodes.filter((n) => n.id !== node.id)}
                />
              ))}
            </div>

            <button
              className="mt-3 w-full rounded border border-slate-300 py-2 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-900"
              onClick={() => addChoice(selectedNodeId)}
            >
              + Add Choice
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

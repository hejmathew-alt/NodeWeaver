'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { DEBOUNCE_SPANS } from '@/lib/constants';
import type { NWVNode, NWVBlock, NWVChoice, NWVStory, NodeType, NWVCharacter, NWVSFXCue, NWVEnemy } from '@nodeweaver/engine';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';
import { useVoiceStore } from '@/store/voice';
import { setActiveDictationTarget, getActiveDictationTarget } from '@/lib/voice-recognition';
import { charSeed } from '@/lib/char-seed';
import { mapQwenToEL } from '@/lib/el-delivery-map';
import { EL_AUDIO_CACHE, makeElCacheKey } from '@/lib/el-audio-cache';
import { buildAIContext, aiContextToFlat } from '@/lib/context-builder';
import { LoomPanel } from './LoomPanel';
import { SFXPlayer } from '@/lib/sfx-player';
import { readAudioFileServer } from '@/lib/audio-storage';

// ── Helpers ─────────────────────────────────────────────────────────────────

const NODE_TYPE_COLOURS: Record<NodeType, string> = {
  story:  '#3b82f6',
  combat: '#ef4444',
  chat:   '#22c55e',
  twist:  '#a855f7',
  start:  '#14b8a6',
  end:    '#f97316',
};

const NODE_TYPE_ITEMS: { type: NodeType; label: string }[] = [
  { type: 'story',  label: 'Story' },
  { type: 'chat',   label: 'Chat' },
  { type: 'combat', label: 'Interactive' },
  { type: 'twist',  label: 'Twist' },
  { type: 'start',  label: 'Start' },
  { type: 'end',    label: 'End' },
];

// ── Graphic equalizer animation ──────────────────────────────────────────────

function MiniEqualizer() {
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-emerald-500"
          style={{
            animation: `eq-bar 0.8s ease-in-out ${i * 0.12}s infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes eq-bar {
          0%   { height: 2px; }
          100% { height: 12px; }
        }
      `}</style>
    </div>
  );
}


// ── ContentEditable block text editor ─────────────────────────────────────────

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function BlockTextEditor({
  text,
  liveText,
  isProse,
  isAiLoading,
  sfxCues,
  hasSfxPanel,
  draggingCueId,
  onTextChange,
  onSfxDrop,
  placeholder,
  voiceModeActive,
  blockId,
}: {
  text: string;
  liveText: string | null;
  isProse: boolean;
  isAiLoading: boolean;
  sfxCues: NWVSFXCue[];
  hasSfxPanel: boolean;
  draggingCueId: string | null;
  onTextChange: (text: string) => void;
  onSfxDrop: (cueId: string, wordIndex: number) => void;
  placeholder: string;
  voiceModeActive?: boolean;
  blockId?: string;
}) {
  const editRef = useRef<HTMLDivElement>(null);
  const lastTextRef = useRef(text);
  const interimSpanRef = useRef<HTMLSpanElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cuesRef = useRef(sfxCues);
  cuesRef.current = sfxCues;
  const hasCues = sfxCues.length > 0;

  // Register as dictation target when voice mode is active and this field is focused
  useEffect(() => {
    const div = editRef.current;
    if (!div || !voiceModeActive || !blockId) return;

    const onFocus = () => {
      setActiveDictationTarget({
        id: blockId,
        insert: (insertedText: string) => {
          const el = editRef.current;
          if (!el) return;
          el.focus();
          // Remove any stale interim span first
          interimSpanRef.current?.remove();
          interimSpanRef.current = null;
          document.execCommand('insertText', false, insertedText);
          onTextChange(el.textContent ?? '');
        },
        setInterim: (interimText: string) => {
          const el = editRef.current;
          if (!el) return;
          interimSpanRef.current?.remove();
          const span = document.createElement('span');
          span.className = 'voice-interim';
          span.textContent = interimText;
          interimSpanRef.current = span;
          el.appendChild(span);
        },
        clearInterim: () => {
          interimSpanRef.current?.remove();
          interimSpanRef.current = null;
        },
      });
    };

    const onBlur = () => {
      if (getActiveDictationTarget()?.id === blockId) {
        setActiveDictationTarget(null);
      }
      interimSpanRef.current?.remove();
      interimSpanRef.current = null;
    };

    div.addEventListener('focus', onFocus);
    div.addEventListener('blur', onBlur);
    return () => {
      div.removeEventListener('focus', onFocus);
      div.removeEventListener('blur', onBlur);
    };
  }, [voiceModeActive, blockId, onTextChange]);

  // Build word-span HTML for SFX visual links
  const buildSpanHtml = useRef((currentText: string, cues: NWVSFXCue[]) => {
    if (!currentText.trim()) return '';
    const words = currentText.trim().split(/\s+/);
    return words.map((word, i) => {
      const linked = cues.find((c) => c.wordIndex === i);
      // Validate hex colour before inserting into style attribute to prevent CSS injection
      const safeColor = linked?.color && /^#[0-9a-fA-F]{6}$/.test(linked.color) ? linked.color : null;
      const style = safeColor ? `border-bottom:2px solid ${safeColor};font-weight:600` : '';
      return `<span data-wi="${i}" style="${style}">${escapeHtml(word)}</span>`;
    }).join(' ');
  }).current;

  // Apply word spans (debounced) — only when SFX cues exist or panel open
  const applySpans = useRef(() => {
    const div = editRef.current;
    if (!div) return;
    const currentText = div.textContent ?? '';
    // Save selection
    const sel = window.getSelection();
    let caretOffset = 0;
    if (sel && sel.rangeCount > 0 && div.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(div);
      preRange.setEnd(range.startContainer, range.startOffset);
      caretOffset = preRange.toString().length;
    }
    div.innerHTML = buildSpanHtml(currentText, cuesRef.current);
    // Restore caret
    if (sel && document.activeElement === div) {
      try {
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
        let charCount = 0;
        let node: Node | null = null;
        while ((node = walker.nextNode())) {
          const len = (node.textContent ?? '').length;
          if (charCount + len >= caretOffset) {
            const newRange = document.createRange();
            newRange.setStart(node, caretOffset - charCount);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            break;
          }
          // TreeWalker visits ALL text nodes (including spaces between spans),
          // so just advance by the node's actual length — no +1 needed.
          charCount += len;
        }
      } catch { /* caret restore best-effort */ }
    }
  }).current;

  // Sync text & spans from external changes (AI write, undo, cue add/delete)
  const prevCuesRef = useRef(sfxCues);
  useEffect(() => {
    const div = editRef.current;
    if (!div) return;
    const displayText = liveText ?? text;
    const textChanged = div.textContent !== displayText;
    const cuesChanged = prevCuesRef.current !== sfxCues;
    prevCuesRef.current = sfxCues;
    if (textChanged || cuesChanged) {
      if (hasCues || hasSfxPanel) {
        div.innerHTML = buildSpanHtml(displayText, sfxCues);
      } else if (div.querySelector('[data-wi]')) {
        // All cues removed — strip spans
        div.textContent = displayText;
      } else if (textChanged) {
        div.textContent = displayText;
      }
      if (textChanged) lastTextRef.current = displayText;
    }
  }, [liveText, text, hasCues, hasSfxPanel, sfxCues, buildSpanHtml]);

  // Debounced span re-application when cues change
  useEffect(() => {
    if (!hasCues && !hasSfxPanel) {
      // All cues removed — strip spans back to plain text
      const div = editRef.current;
      if (div && div.querySelector('[data-wi]')) {
        div.textContent = div.textContent ?? '';
      }
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(applySpans, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [sfxCues, hasSfxPanel, hasCues, applySpans]);

  // Helper: resolve event target to an Element (drop target may be a Text node)
  const resolveEl = (t: EventTarget | null): Element | null => {
    if (!t) return null;
    return t instanceof Element ? t : (t as Node).parentElement;
  };

  // Drop handler for word spans
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = resolveEl(e.target)?.closest('[data-wi]');
    if (!target) return;
    const cueId = e.dataTransfer.getData('text/plain');
    const wi = parseInt(target.getAttribute('data-wi') ?? '', 10);
    if (cueId && !isNaN(wi)) onSfxDrop(cueId, wi);
  };

  const handleDragOver = (e: React.DragEvent) => {
    const target = resolveEl(e.target)?.closest('[data-wi]');
    if (target) {
      e.preventDefault();
      (target as HTMLElement).style.backgroundColor = '#d1fae5';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const target = resolveEl(e.target)?.closest('[data-wi]');
    if (target) (target as HTMLElement).style.backgroundColor = '';
  };

  return (
    <div className="px-2 pt-1 relative">
      <div
        ref={editRef}
        contentEditable={!isAiLoading}
        suppressContentEditableWarning
        role="textbox"
        aria-placeholder={placeholder}
        className={`w-full bg-transparent text-xs text-slate-900 focus:outline-none overflow-y-auto whitespace-pre-wrap ${
          isProse ? 'min-h-[4rem] max-h-[12rem]' : 'min-h-[2rem] max-h-[6rem]'
        } ${isAiLoading ? 'text-violet-700' : ''} ${
          draggingCueId ? '[&_[data-wi]]:cursor-crosshair [&_[data-wi]:hover]:bg-emerald-100' : ''
        } empty:before:content-[attr(aria-placeholder)] empty:before:text-slate-400`}
        onInput={(e) => {
          if (isAiLoading) return;
          const newText = e.currentTarget.textContent ?? '';
          lastTextRef.current = newText;
          onTextChange(newText);
          // Re-apply spans after typing pause
          if (hasCues || hasSfxPanel) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(applySpans, DEBOUNCE_SPANS);
          }
        }}
        onBlur={() => {
          const newText = editRef.current?.textContent ?? '';
          if (newText !== lastTextRef.current) {
            lastTextRef.current = newText;
            onTextChange(newText);
          }
          // Final span application on blur
          if (hasCues || hasSfxPanel) applySpans();
        }}
        onPaste={(e) => {
          e.preventDefault();
          const plain = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, plain);
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      />
    </div>
  );
}

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

  const OUTCOME_STYLE: Record<string, string> = {
    victory: 'bg-green-100 text-green-700',
    defeat:  'bg-red-100 text-red-700',
    escape:  'bg-slate-100 text-slate-600',
  };
  const canDelete = choice.combatOutcome !== 'victory' && choice.combatOutcome !== 'defeat';

  return (
    <div className={`rounded-lg border bg-slate-50 ${choice.combatOutcome ? 'border-slate-300' : 'border-slate-200'}`}>
      {/* Choice header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          className="shrink-0 text-slate-400 hover:text-slate-700"
          onClick={() => setExpanded((x) => !x)}
          aria-label="Toggle choice"
        >
          {expanded ? '▾' : '▸'}
        </button>

        {choice.combatOutcome && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${OUTCOME_STYLE[choice.combatOutcome]}`}>
            {choice.combatOutcome}
          </span>
        )}

        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          placeholder="Choice label…"
          value={choice.label}
          onChange={(e) => up({ label: e.target.value })}
        />

        <button
          className={`shrink-0 ${canDelete ? 'text-slate-400 hover:text-red-500' : 'cursor-not-allowed text-slate-200'}`}
          onClick={() => canDelete && deleteChoice(nodeId, choice.id)}
          aria-label="Delete choice"
          title={canDelete ? 'Delete choice' : 'Victory and Defeat choices cannot be deleted'}
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
  storyId,
  characters,
  defaultCharacterId,
  readingBlockId,
  anthropicKey,
  sfxProvider,
  elevenLabsKey,
  context,
  onPlayBlock,
  onStopBlock,
}: {
  blocks: NWVBlock[];
  nodeId: string;
  storyId: string;
  characters: NWVCharacter[];
  defaultCharacterId?: string;
  readingBlockId: string | null;
  anthropicKey: string;
  sfxProvider: string;
  elevenLabsKey: string;
  context: Record<string, unknown>;
  onPlayBlock: (blockId: string) => void;
  onStopBlock: () => void;
}) {
  const { addBlock, updateBlock, deleteBlock, moveBlock } = useStoryStore();
  const voiceModeActive = useVoiceStore((s) => s.voiceModeActive);
  const [aiLoadingBlockId, setAiLoadingBlockId] = useState<string | null>(null);
  // Local streaming text — avoids hammering the store on every chunk
  const [streamingText, setStreamingText] = useState<{ blockId: string; text: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [playingBlockId, setPlayingBlockId] = useState<string | null>(null);

  // Clear per-block play state when playback finishes (readingBlockId goes null)
  useEffect(() => {
    if (!readingBlockId && playingBlockId) setPlayingBlockId(null);
  }, [readingBlockId, playingBlockId]);

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
        const isReadAll = readingBlockId === block.id;
        const isPlaying = playingBlockId === block.id;
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
              (isReadAll || isPlaying)
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
                  onClick={() => {
                    if (isPlaying) {
                      onStopBlock();
                      setPlayingBlockId(null);
                    } else {
                      setPlayingBlockId(block.id);
                      onPlayBlock(block.id);
                    }
                  }}
                  title={isPlaying ? 'Stop playback' : 'Play this block (TTS)'}
                  className={`${isPlaying ? 'text-[14px] leading-none text-violet-700' : 'text-[10px] text-violet-400 hover:text-violet-700'}`}
                >{isPlaying ? '\u25A0' : '\u25B6'}</button>
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

            {/* Text area — contentEditable with inline SFX word underlines */}
            <BlockTextEditor
              text={block.text}
              liveText={liveText}
              isProse={isProse}
              isAiLoading={isAiLoading}
              sfxCues={block.sfxCues ?? []}
              hasSfxPanel={false}
              draggingCueId={null}
              onTextChange={(t) => updateBlock(nodeId, block.id, { text: t })}
              onSfxDrop={() => {}}
              placeholder={isProse ? 'Narrative text…' : 'Dialogue…'}
              voiceModeActive={voiceModeActive}
              blockId={block.id}
            />

            {/* Per-block TTS controls — EL dropdowns when character uses EL, Q dropdowns otherwise */}
            {resolvedChar?.ttsProvider === 'elevenlabs' ? (() => {
              const defStab = resolvedChar.elevenLabsStability ?? 0.5;
              const defSim  = resolvedChar.elevenLabsSimilarity ?? 0.75;
              const defSty  = resolvedChar.elevenLabsStyle ?? 0.0;
              const EL_OPTIONS: Record<string, { value: number; label: string }[]> = {
                elevenLabsStability: [
                  { value: 0.0,  label: '0.0 – Wildly unpredictable' },
                  { value: 0.2,  label: '0.2 – Spontaneous, raw emotion' },
                  { value: 0.35, label: '0.35 – Expressive, natural variance' },
                  { value: 0.5,  label: '0.5 – Balanced (recommended)' },
                  { value: 0.65, label: '0.65 – Controlled, measured' },
                  { value: 0.8,  label: '0.8 – Very consistent' },
                  { value: 1.0,  label: '1.0 – Robotic, zero variation' },
                ],
                elevenLabsSimilarity: [
                  { value: 0.0,  label: '0.0 – Creative divergence' },
                  { value: 0.3,  label: '0.3 – Loose interpretation' },
                  { value: 0.5,  label: '0.5 – Moderate fidelity' },
                  { value: 0.75, label: '0.75 – Close to voice design' },
                  { value: 0.9,  label: '0.9 – Near exact' },
                  { value: 1.0,  label: '1.0 – Perfect fidelity' },
                ],
                elevenLabsStyle: [
                  { value: 0.0,  label: '0.0 – Off, most natural (default)' },
                  { value: 0.2,  label: '0.2 – Barely perceptible' },
                  { value: 0.4,  label: '0.4 – Subtle emphasis' },
                  { value: 0.6,  label: '0.6 – Noticeable style' },
                  { value: 0.8,  label: '0.8 – Strong exaggeration' },
                  { value: 1.0,  label: '1.0 – Maximum (may distort)' },
                ],
              };
              const dropdowns = [
                { label: 'Stability',  key: 'elevenLabsStability'  as const, val: block.elevenLabsStability,   def: defStab },
                { label: 'Similarity', key: 'elevenLabsSimilarity' as const, val: block.elevenLabsSimilarity,  def: defSim  },
                { label: 'Style',      key: 'elevenLabsStyle'      as const, val: block.elevenLabsStyle,       def: defSty  },
              ];
              return (
                <div className="flex gap-1.5 border-t border-slate-100 px-2 pb-1.5 pt-1">
                  {dropdowns.map(({ label, key, val, def }) => (
                    <select
                      key={key}
                      className={`flex-1 min-w-0 bg-transparent text-[10px] focus:text-slate-700 focus:outline-none cursor-pointer ${val != null ? 'text-slate-700' : 'text-violet-400'}`}
                      value={val ?? ''}
                      onChange={(e) => updateBlock(nodeId, block.id, { [key]: e.target.value ? parseFloat(e.target.value) : undefined })}
                    >
                      <option value="">{label} {def.toFixed(2)} (default)</option>
                      {EL_OPTIONS[key].map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ))}
                </div>
              );
            })() : (() => {
              const defEmotion = resolvedChar?.defaultEmotion;
              const defTone = resolvedChar?.defaultTone;
              const defTexture = resolvedChar?.defaultVoiceTexture;
              const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
              return (
                <div className="flex gap-1.5 border-t border-slate-100 px-2 pb-1.5 pt-1">
                  <select
                    className={`flex-1 min-w-0 bg-transparent text-[10px] focus:text-slate-700 focus:outline-none cursor-pointer ${block.emotion ? 'text-slate-700' : defEmotion ? 'text-violet-400' : 'text-slate-400'}`}
                    value={block.emotion ?? ''}
                    onChange={(e) => updateBlock(nodeId, block.id, { emotion: e.target.value || undefined })}
                  >
                    <option value="">{defEmotion ? `${cap(defEmotion)} (default)` : 'Emotion…'}</option>
                    {EMOTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select
                    className={`flex-1 min-w-0 bg-transparent text-[10px] focus:text-slate-700 focus:outline-none cursor-pointer ${block.tone ? 'text-slate-700' : defTone ? 'text-violet-400' : 'text-slate-400'}`}
                    value={block.tone ?? ''}
                    onChange={(e) => updateBlock(nodeId, block.id, { tone: e.target.value || undefined })}
                  >
                    <option value="">{defTone ? `${cap(defTone)} (default)` : 'Tone…'}</option>
                    {TONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select
                    className={`flex-1 min-w-0 bg-transparent text-[10px] focus:text-slate-700 focus:outline-none cursor-pointer ${block.voiceTexture ? 'text-slate-700' : defTexture ? 'text-violet-400' : 'text-slate-400'}`}
                    value={block.voiceTexture ?? ''}
                    onChange={(e) => updateBlock(nodeId, block.id, { voiceTexture: e.target.value || undefined })}
                  >
                    <option value="">{defTexture ? `${cap(defTexture)} (default)` : 'Voice…'}</option>
                    {VOICE_TEXTURE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              );
            })()}

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
    assignNodeToLane,
    removeNodeFromLane,
  } = useStoryStore();
  const { anthropicKey, sfxProvider, elevenLabsKey, qwenTemperature } = useSettingsStore();

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const typePickerRef = useRef<HTMLDivElement>(null);
  const [laneDropdownOpen, setLaneDropdownOpen] = useState(false);
  const laneDropdownRef = useRef<HTMLDivElement>(null);

  // Section collapse state
  const [contentCollapsed, setContentCollapsed] = useState(false);
  const [choicesCollapsed, setChoicesCollapsed] = useState(false);

  // Block SFX playback (for Read button and per-block play)
  const sfxPlayerRef = useRef<SFXPlayer | null>(null);

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

  // Close lane dropdown on outside click / Escape
  useEffect(() => {
    if (!laneDropdownOpen) return;
    const onMouse = (e: MouseEvent) => {
      if (laneDropdownRef.current && !laneDropdownRef.current.contains(e.target as globalThis.Element)) setLaneDropdownOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLaneDropdownOpen(false); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey); };
  }, [laneDropdownOpen]);

  // Voice reading state
  const [reading, setReading] = useState(false);
  const [readingBlockId, setReadingBlockId] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const readAbortRef = useRef<{ stop: boolean }>({ stop: false });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);
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
      voiceGainRef.current = audioCtxRef.current.createGain();
      voiceGainRef.current.connect(audioCtxRef.current.destination);
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
      source.connect(voiceGainRef.current ?? ctx.destination);
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

  // ── ElevenLabs live playback ─────────────────────────────────────────────────
  // Fetches a full MP3 from /api/tts/elevenlabs then plays it via new Audio().
  // Used when a character has ttsProvider === 'elevenlabs' and a locked voiceId.

  async function playElevenLabsLine(
    text: string,
    character: NWVCharacter,
    opts?: { emotion?: string; tone?: string; voiceTexture?: string; elStability?: number; elSimilarity?: number; elStyle?: number },
  ): Promise<boolean> {
    const abort = readAbortRef.current;
    if (!text.trim() || abort.stop || !character.elevenLabsVoiceId) return false;

    // Block-level EL values take priority → fall back to Q-mapped delivery → fall back to character defaults
    let delivery: { stability?: number; similarity?: number; style?: number };
    if (opts?.elStability != null || opts?.elSimilarity != null || opts?.elStyle != null) {
      delivery = {
        stability:  opts.elStability  ?? character.elevenLabsStability,
        similarity: opts.elSimilarity ?? character.elevenLabsSimilarity,
        style:      opts.elStyle      ?? character.elevenLabsStyle,
      };
    } else {
      const emotion = opts?.emotion || character.defaultEmotion;
      const tone = opts?.tone || character.defaultTone;
      const voiceTexture = opts?.voiceTexture || character.defaultVoiceTexture;
      delivery = (emotion || tone || voiceTexture)
        ? mapQwenToEL(emotion, tone, voiceTexture)
        : { stability: character.elevenLabsStability, similarity: character.elevenLabsSimilarity, style: character.elevenLabsStyle };
    }

    const cacheKey = makeElCacheKey(text, character.elevenLabsVoiceId, delivery.stability, delivery.similarity, delivery.style);

    // Check shared in-memory cache first
    let arrayBuf: ArrayBuffer;
    if (EL_AUDIO_CACHE.has(cacheKey)) {
      arrayBuf = EL_AUDIO_CACHE.get(cacheKey)!;
    } else {
      let res: Response;
      try {
        res = await fetch('/api/tts/elevenlabs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceId: character.elevenLabsVoiceId,
            elevenLabsKey,
            stability: delivery.stability,
            similarity: delivery.similarity,
            style: delivery.style,
          }),
        });
      } catch { return false; }

      if (!res.ok || abort.stop) {
        if (!abort.stop) setReadError(`ElevenLabs TTS failed (${res.status})`);
        return false;
      }

      arrayBuf = await res.arrayBuffer();
      if (abort.stop) return false;
      EL_AUDIO_CACHE.set(cacheKey, arrayBuf);
    }

    if (abort.stop) return false;
    const url = URL.createObjectURL(new Blob([arrayBuf], { type: 'audio/mpeg' }));
    return new Promise<boolean>((resolve) => {
      const audio = new Audio(url);
      audio.volume = useSettingsStore.getState().volumeVoice;
      const checkAbort = setInterval(() => {
        if (abort.stop) { audio.pause(); clearInterval(checkAbort); URL.revokeObjectURL(url); resolve(false); }
      }, 100);
      audio.onended = () => { clearInterval(checkAbort); URL.revokeObjectURL(url); resolve(!abort.stop); };
      audio.onerror = () => { clearInterval(checkAbort); URL.revokeObjectURL(url); resolve(false); };
      audio.play().catch(() => { clearInterval(checkAbort); URL.revokeObjectURL(url); resolve(false); });
    });
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

    // Apply current voice volume to the master gain node
    if (voiceGainRef.current) voiceGainRef.current.gain.value = useSettingsStore.getState().volumeVoice;

    // Per-block values override character defaults
    const emotion = opts?.emotion || character.defaultEmotion;
    const tone = opts?.tone || character.defaultTone;
    const voiceTexture = opts?.voiceTexture || character.defaultVoiceTexture;
    const deliveryParts: string[] = [];
    if (emotion && emotion !== 'neutral') deliveryParts.push(`${emotion} emotion`);
    if (tone) deliveryParts.push(`${tone} delivery`);
    if (voiceTexture) deliveryParts.push(`${voiceTexture} voice quality`);
    const delivery = deliveryParts.length > 0 ? ` Speak with ${deliveryParts.join(', ')}.` : '';
    const instruct = (character.qwenInstruct ?? '') + delivery;

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
          temperature: qwenTemperature,
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

  // Fire SFX cues for a block at word-position-estimated offsets (mirrors PlayMode logic)
  function playBlockSfx(block: NWVBlock) {
    if (!block.sfxCues?.length) return;
    if (!sfxPlayerRef.current) sfxPlayerRef.current = new SFXPlayer();
    const player = sfxPlayerRef.current;
    const words = block.text.trim().split(/\s+/);
    const totalWords = Math.max(1, words.length);
    const estimatedMs = Math.max(1200, Math.min(totalWords * 400, 12000));
    const startedAt = Date.now(); // single reference point for all cues
    Promise.all(
      block.sfxCues!.map((cue) =>
        readAudioFileServer(activeStory!.id, cue.filename).catch(() => null)
      )
    ).then((bufs) => {
      block.sfxCues!.forEach((cue, idx) => {
        const buf = bufs[idx];
        if (!buf) return;
        const offset = cue.wordIndex != null
          ? Math.round((cue.wordIndex / totalWords) * estimatedMs) + (cue.wordOffsetMs ?? 0)
          : (cue.offsetMs ?? 0);
        setTimeout(() => {
          if (!readAbortRef.current.stop) player.playOnce(buf, useSettingsStore.getState().volumeSfx);
        }, Math.max(0, startedAt + offset - Date.now()));
      });
    });
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
      playBlockSfx(block);
      if (character.ttsProvider === 'elevenlabs' && character.elevenLabsVoiceId) {
        await playElevenLabsLine(block.text, character, { emotion: block.emotion, tone: block.tone, voiceTexture: block.voiceTexture, elStability: block.elevenLabsStability, elSimilarity: block.elevenLabsSimilarity, elStyle: block.elevenLabsStyle });
      } else {
        await streamQwenLine(block.text, character, { emotion: block.emotion, tone: block.tone, voiceTexture: block.voiceTexture });
      }
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

    playBlockSfx(block);
    if (character.ttsProvider === 'elevenlabs' && character.elevenLabsVoiceId) {
      await playElevenLabsLine(block.text, character, { emotion: block.emotion, tone: block.tone, voiceTexture: block.voiceTexture, elStability: block.elevenLabsStability, elSimilarity: block.elevenLabsSimilarity, elStyle: block.elevenLabsStyle });
    } else {
      await streamQwenLine(block.text, character, { emotion: block.emotion, tone: block.tone, voiceTexture: block.voiceTexture });
    }

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

        {/* Interaction type pill — only for Interactive/combat nodes */}
        {node.type === 'combat' && (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            ⚔ {node.interactionType === 'dice-combat' ? 'Dice Combat' : (node.interactionType ?? 'Dice Combat')}
          </span>
        )}

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

        {/* ── Lanes assignment ── */}
        {(activeStory.lanes ?? []).length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs text-slate-400">Lanes</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {(node.lanes ?? []).map((laneId) => {
                const lane = (activeStory.lanes ?? []).find((l) => l.id === laneId);
                if (!lane) return null;
                return (
                  <span
                    key={laneId}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: `${lane.colour}18`,
                      border: `1px solid ${lane.colour}50`,
                      color: lane.colour,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: lane.colour }} />
                    {lane.name}
                    <button
                      onClick={() => removeNodeFromLane(node.id, laneId)}
                      className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
              {/* + Add dropdown */}
              {(activeStory.lanes ?? []).some((l) => !(node.lanes ?? []).includes(l.id)) && (
                <div ref={laneDropdownRef} className="relative">
                  <button
                    onClick={() => setLaneDropdownOpen((v) => !v)}
                    className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors"
                  >
                    + Add ▾
                  </button>
                  {laneDropdownOpen && (
                    <div className="absolute left-0 top-full z-30 mt-1 min-w-max rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {(activeStory.lanes ?? [])
                        .filter((l) => !(node.lanes ?? []).includes(l.id))
                        .map((lane) => (
                          <button
                            key={lane.id}
                            onClick={() => {
                              assignNodeToLane(node.id, lane.id);
                              setLaneDropdownOpen(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: lane.colour }} />
                            {lane.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Combat config (Interactive nodes only) ── */}
        {node.type === 'combat' && (
          <div className="border-t border-slate-200 pt-3 pb-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400">Combat</p>
            <label className="mb-1 block text-xs text-slate-500">Enemy</label>
            <select
              value={node.combatEnemy ?? ''}
              onChange={(e) => up({ combatEnemy: e.target.value || undefined })}
              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none"
            >
              <option value="">— select enemy —</option>
              {Object.entries(activeStory.enemies ?? {}).map(([key, enemy]) => (
                <option key={key} value={key}>{(enemy as NWVEnemy).name}</option>
              ))}
            </select>
            {Object.keys(activeStory.enemies ?? {}).length === 0 && (
              <p className="mt-1 text-xs italic text-slate-400">No enemies yet — add them via the Enemies panel.</p>
            )}
          </div>
        )}

        {/* ── Content blocks ── */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <button onClick={() => setContentCollapsed(!contentCollapsed)} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
              <span className={`inline-block text-[9px] transition-transform ${contentCollapsed ? '' : 'rotate-90'}`}>&#9654;</span>
              Content
            </button>
            {!contentCollapsed && (
              <div className="flex gap-1">
                <button
                  onClick={handleRead}
                  title={reading ? 'Stop playback' : 'Read all blocks with character voices'}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${reading ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'text-violet-500 hover:bg-violet-50 hover:text-violet-700'}`}
                >{reading ? '\u23F9 Stop' : '\u25B6 Read'}</button>
              </div>
            )}
          </div>
          {!contentCollapsed && (
            <div>
              <BlockEditor
                blocks={blocks}
                nodeId={selectedNodeId}
                storyId={activeStory.id}
                characters={activeStory.characters}
                defaultCharacterId={node.character}
                readingBlockId={readingBlockId}
                anthropicKey={anthropicKey}
                sfxProvider={sfxProvider}
                elevenLabsKey={elevenLabsKey}
                context={aiContextToFlat(buildAIContext(activeStory, selectedNodeId), activeStory, selectedNodeId)}
                onPlayBlock={handleReadBlock}
                onStopBlock={stopReading}
              />
              {readError && <p className="mt-1.5 text-xs text-red-500">{readError}</p>}
            </div>
          )}
        </div>

        {/* ── Choices ── */}
        {node.type !== 'end' && (
          <div className="border-t border-slate-200 pt-2">
            <button onClick={() => setChoicesCollapsed(!choicesCollapsed)} className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600">
              <span className={`inline-block text-[9px] transition-transform ${choicesCollapsed ? '' : 'rotate-90'}`}>&#9654;</span>
              Choices ({node.choices.length})
            </button>
            {!choicesCollapsed && (
              <div>
                {node.choices.length === 0 && (
                  <p className="mb-3 text-xs text-slate-400">No choices yet. Add one or drag from a handle to connect nodes.</p>
                )}
                <div className="space-y-2">
                  {node.choices.map((choice) => (
                    <ChoiceCard key={choice.id} choice={choice} nodeId={node.id} allNodes={activeStory.nodes.filter((n) => n.id !== node.id)} />
                  ))}
                </div>
                {node.type !== 'combat' && (
                  <button className="mt-3 w-full rounded border border-slate-300 py-2 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-900" onClick={() => addChoice(selectedNodeId)}>+ Add Choice</button>
                )}
                {node.type === 'combat' && !node.choices.some((c) => c.combatOutcome === 'escape') && (
                  <button
                    className="mt-2 w-full rounded border border-slate-200 py-1.5 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                    onClick={() => addChoice(selectedNodeId, { label: 'Escape', combatOutcome: 'escape' })}
                  >
                    + Enable Escape
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Loom ── */}
        <div className="border-t border-slate-100 -mx-4 px-4">
          <LoomPanel story={activeStory} nodeId={selectedNodeId} />
        </div>

      </div>
    </aside>
  );
}

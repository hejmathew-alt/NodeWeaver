'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { NWVStory } from '@nodeweaver/engine';
import { useVoiceStore } from '@/store/voice';
import { useSettingsStore } from '@/lib/settings';
import { useStoryStore } from '@/store/story';
import {
  getVoiceRecognition,
  handleVoiceEvent,
} from '@/lib/voice-recognition';
import { fetchCommandIntent, executeCommand } from '@/lib/voice-commands';
import { TTSPlayer } from '@/lib/tts-player';

interface VoiceHUDProps {
  story: NWVStory;
}

/**
 * Voice assistant HUD — orchestrates microphone recognition, command parsing,
 * dictation routing, and TTS responses. Mounts as a floating overlay above
 * the canvas. Only visible when voiceModeActive is true.
 */
export function VoiceHUD({ story }: VoiceHUDProps) {
  const {
    voiceModeActive,
    status,
    lastInterim,
    lastCommandResult,
    lastErrorMessage,
    setStatus,
    setLastTranscript,
    setLastInterim,
    setLastCommandResult,
    setLastErrorMessage,
    setVoiceModeActive,
  } = useVoiceStore();

  const {
    wakeWord,
    voiceResponseMode,
    voiceLanguage,
    voiceAssistantInstruct,
    anthropicKey,
  } = useSettingsStore();

  const {
    selectedNodeId,
    addCharacterNamed,
    setSelectedPanel,
    setActiveView,
    createNode,
    saveToLinkedFile,
    setCanvasPlayNodeId,
    undoDeleteNode,
    addBlock,
  } = useStoryStore();

  const speakerRef = useRef<TTSPlayer | null>(null);
  const storyRef = useRef(story);
  useEffect(() => { storyRef.current = story; }, [story]);
  const selectedNodeIdRef = useRef(selectedNodeId);
  useEffect(() => { selectedNodeIdRef.current = selectedNodeId; }, [selectedNodeId]);

  // ── TTS response ───────────────────────────────────────────────────────────

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;
      setStatus('speaking');

      if (voiceResponseMode === 'browser') {
        return new Promise<void>((resolve) => {
          const utt = new SpeechSynthesisUtterance(text);
          utt.onend = () => { setStatus('listening'); resolve(); };
          utt.onerror = () => { setStatus('listening'); resolve(); };
          window.speechSynthesis.cancel(); // clear any queued
          window.speechSynthesis.speak(utt);
        });
      } else {
        // Qwen narrator voice with custom assistant instruct
        const narrator = storyRef.current.characters.find((c) => c.id === 'narrator');
        if (narrator) {
          const assistantChar = {
            ...narrator,
            qwenInstruct: voiceAssistantInstruct || narrator.qwenInstruct,
          };
          const player = new TTSPlayer();
          speakerRef.current = player;
          await player.playLine(text, assistantChar, { temperature: 0.3 });
          speakerRef.current = null;
        }
        setStatus('listening');
      }
    },
    [voiceResponseMode, voiceAssistantInstruct, setStatus],
  );

  // ── Command handler ────────────────────────────────────────────────────────

  const handleCommand = useCallback(
    async (transcript: string) => {
      setStatus('processing');

      const currentStory = storyRef.current;
      const currentNodeId = selectedNodeIdRef.current;
      const selectedNode = currentStory.nodes.find((n) => n.id === currentNodeId);

      const context = {
        storyTitle: currentStory.metadata.title,
        genre: currentStory.metadata.genre,
        selectedNodeTitle: selectedNode?.title,
        characterNames: currentStory.characters.map((c) => c.name),
      };

      const result = await fetchCommandIntent(transcript, anthropicKey, context);

      if (!result || result.confidence < 0.6) {
        const msg =
          result?.humanResponse ??
          `I didn't catch that. Try saying "${wakeWord}, add a character" or "${wakeWord}, save".`;
        setLastCommandResult(msg);
        await speak(msg);
        return;
      }

      const response = executeCommand(result, {
        story: currentStory,
        selectedNodeId: currentNodeId,
        addCharacterNamed,
        setSelectedPanel,
        setActiveView,
        createNode,
        saveToLinkedFile,
        setCanvasPlayNodeId,
        undoDeleteNode,
        addBlock,
      });

      setLastCommandResult(response);
      await speak(response);
    },
    [
      anthropicKey,
      wakeWord,
      speak,
      setStatus,
      setLastCommandResult,
      addCharacterNamed,
      setSelectedPanel,
      createNode,
      saveToLinkedFile,
      setCanvasPlayNodeId,
      undoDeleteNode,
      addBlock,
    ],
  );

  // ── Recognition lifecycle ──────────────────────────────────────────────────

  useEffect(() => {
    const rec = getVoiceRecognition();
    rec.updateLanguage(voiceLanguage);

    if (!voiceModeActive) {
      rec.stop();
      speakerRef.current?.dispose();
      speakerRef.current = null;
      return;
    }

    const off = rec.on((event) => {
      if (event.type === 'started') {
        setStatus('listening');
        setLastErrorMessage(null);
      }
      if (event.type === 'error') {
        setLastErrorMessage(event.message);
        setStatus('idle');
      }
      if (event.type === 'stopped' && voiceModeActive) {
        setStatus('idle');
      }
      handleVoiceEvent(event, wakeWord, handleCommand, {
        setStatus,
        setLastTranscript,
        setLastInterim,
      });
    });

    rec.start();

    return () => {
      off();
      rec.stop();
      speakerRef.current?.dispose();
      speakerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceModeActive, wakeWord, voiceLanguage]);

  if (!voiceModeActive) return null;

  const isListening = status === 'listening';
  const isProcessing = status === 'processing';
  const isSpeaking = status === 'speaking';

  return (
    <div
      className="absolute bottom-20 left-1/2 z-40 -translate-x-1/2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur-sm"
      style={{ minWidth: 280, maxWidth: 480 }}
    >
      {/* Status row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status indicator */}
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: isListening
              ? '#ef444430'
              : isProcessing
              ? '#f59e0b30'
              : '#a855f730',
          }}
        >
          {isListening && (
            <span
              className="h-2.5 w-2.5 rounded-full bg-red-500"
              style={{ animation: 'nodePulse 1.2s ease-in-out infinite' }}
            />
          )}
          {isProcessing && (
            <span className="h-3 w-3 animate-spin rounded-full border border-amber-400 border-t-transparent" />
          )}
          {isSpeaking && (
            <span className="flex items-end gap-[2px]" style={{ height: 12 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-sm bg-violet-400"
                  style={{
                    height: 3,
                    animation: `eqBar 0.5s ease-in-out ${i * 0.12}s infinite alternate`,
                  }}
                />
              ))}
            </span>
          )}
          {!isListening && !isProcessing && !isSpeaking && (
            <span className="h-2 w-2 rounded-full bg-slate-500" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-slate-300">
            {isListening
              ? 'Listening…'
              : isProcessing
              ? 'Thinking…'
              : isSpeaking
              ? 'Speaking'
              : 'Voice active'}
          </p>
          {lastInterim && isListening && (
            <p className="truncate text-xs italic text-violet-300 opacity-70">
              {lastInterim}
            </p>
          )}
          {lastCommandResult && !lastInterim && (
            <p className="truncate text-xs text-slate-400">{lastCommandResult}</p>
          )}
          {lastErrorMessage && !lastInterim && (
            <p className="truncate text-xs text-red-400">{lastErrorMessage}</p>
          )}
        </div>

        {/* Stop button */}
        <button
          onClick={() => setVoiceModeActive(false)}
          className="shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          title="Stop voice mode"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        </button>
      </div>

      {/* Wake word hint */}
      <div className="border-t border-slate-700/60 px-4 py-1.5">
        <p className="text-[9px] text-slate-500">
          Say{' '}
          <span className="font-mono text-slate-400">
            {wakeWord.charAt(0).toUpperCase() + wakeWord.slice(1)}, [command]
          </span>{' '}
          for AI commands · otherwise dictates to focused field
        </p>
      </div>
    </div>
  );
}

/**
 * Voice command execution — fetches intent from Claude and maps to store actions.
 */
import type { NWVStory, NodeType } from '@nodeweaver/engine';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceCommandResult {
  intent: string;
  confidence: number;
  params: Record<string, unknown>;
  humanResponse: string;
}

export interface CommandExecutorDeps {
  story: NWVStory | null;
  selectedNodeId: string | null;
  addCharacterNamed: (name: string) => string;
  setSelectedPanel: (panel: 'settings' | null) => void;
  setActiveView: (view: 'canvas' | 'characters' | 'encounters') => void;
  createNode: (type: NodeType) => void;
  saveToLinkedFile: () => Promise<unknown>;
  setCanvasPlayNodeId: (id: string | null) => void;
  undoDeleteNode: () => void;
  addBlock: (nodeId: string, type: 'prose' | 'line') => void;
}

// ── Claude call ───────────────────────────────────────────────────────────────

export async function fetchCommandIntent(
  transcript: string,
  anthropicKey: string,
  context: {
    storyTitle?: string;
    genre?: string;
    selectedNodeTitle?: string;
    characterNames?: string[];
  },
): Promise<VoiceCommandResult | null> {
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'command-interpret',
      prompt: transcript,
      anthropicKey,
      context,
    }),
  }).catch(() => null);

  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { command?: string } | null;
  if (!data?.command) return null;

  try {
    return JSON.parse(data.command) as VoiceCommandResult;
  } catch (err) {
    console.warn('[voice-commands] Malformed command JSON from AI:', err);
    return null;
  }
}

// ── Executor ──────────────────────────────────────────────────────────────────

export function executeCommand(
  result: VoiceCommandResult,
  deps: CommandExecutorDeps,
): string {
  const { intent, params, humanResponse } = result;
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
  } = deps;

  switch (intent) {
    case 'add-character': {
      const name = (params.name as string) || 'New Character';
      addCharacterNamed(name);
      setActiveView('characters');
      return humanResponse;
    }
    case 'new-node': {
      const type = ((params.type as string) || 'story') as NodeType;
      createNode(type);
      return humanResponse;
    }
    case 'save': {
      saveToLinkedFile().catch(() => {});
      return humanResponse;
    }
    case 'play':
    case 'read-back': {
      if (selectedNodeId) {
        setCanvasPlayNodeId(selectedNodeId);
        return humanResponse;
      }
      return 'No node selected. Click a node on the canvas first.';
    }
    case 'undo': {
      undoDeleteNode();
      return humanResponse;
    }
    case 'new-block': {
      if (selectedNodeId) {
        const blockType = (params.blockType as 'prose' | 'line') ?? 'prose';
        addBlock(selectedNodeId, blockType);
        return humanResponse;
      }
      return 'Select a node first.';
    }
    case 'open-settings': {
      setSelectedPanel('settings');
      return humanResponse;
    }
    case 'open-characters': {
      setActiveView('characters');
      return humanResponse;
    }
    case 'unknown':
    default:
      return humanResponse;
  }
}

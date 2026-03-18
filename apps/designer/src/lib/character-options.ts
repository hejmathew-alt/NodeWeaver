// Shared character delivery options — used by CharacterPanel and CharactersPage

function capitalise(v: string) {
  return { value: v, label: v.charAt(0).toUpperCase() + v.slice(1) };
}

export const EMOTION_OPTIONS = [
  'neutral', 'happy', 'sad', 'angry', 'fearful', 'surprised', 'excited',
  'tender', 'anxious', 'melancholic', 'curious', 'determined', 'amused', 'contemptuous',
].map(capitalise);

export const TONE_OPTIONS = [
  'calm', 'whispering', 'shouting', 'urgent', 'sarcastic', 'monotone', 'cheerful',
  'somber', 'authoritative', 'hesitant', 'pleading', 'threatening', 'gentle', 'cold',
].map(capitalise);

export const VOICE_TEXTURE_OPTIONS = [
  'breathy', 'strained', 'gravelly', 'husky', 'nasal', 'raspy',
  'smooth', 'trembling', 'crisp', 'soft', 'throaty', 'clear',
].map(capitalise);

// Multilingual support — 70% English, 30% random world languages.
// Each language has matching TTS voices and a prompt instruction.

const LANGUAGES = [
  { code: 'de', name: 'German', instruction: 'Write entirely in German.', voices: ['de-DE-ConradNeural', 'de-DE-KatjaNeural', 'de-AT-JonasNeural'] },
  { code: 'fr', name: 'French', instruction: 'Write entirely in French.', voices: ['fr-FR-HenriNeural', 'fr-FR-DeniseNeural', 'fr-CA-AntoineNeural'] },
  { code: 'es', name: 'Spanish', instruction: 'Write entirely in Spanish.', voices: ['es-ES-AlvaroNeural', 'es-ES-ElviraNeural', 'es-MX-DaliaNeural'] },
  { code: 'it', name: 'Italian', instruction: 'Write entirely in Italian.', voices: ['it-IT-DiegoNeural', 'it-IT-ElsaNeural'] },
  { code: 'pt', name: 'Portuguese', instruction: 'Write entirely in Brazilian Portuguese.', voices: ['pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural'] },
  { code: 'nl', name: 'Dutch', instruction: 'Write entirely in Dutch.', voices: ['nl-NL-MaartenNeural', 'nl-NL-ColetteNeural'] },
  { code: 'ja', name: 'Japanese', instruction: 'Write entirely in Japanese.', voices: ['ja-JP-KeitaNeural', 'ja-JP-NanamiNeural'] },
  { code: 'ko', name: 'Korean', instruction: 'Write entirely in Korean.', voices: ['ko-KR-InJoonNeural', 'ko-KR-SunHiNeural'] },
  { code: 'zh', name: 'Mandarin', instruction: 'Write entirely in Mandarin Chinese.', voices: ['zh-CN-YunxiNeural', 'zh-CN-XiaoxiaoNeural'] },
  { code: 'ru', name: 'Russian', instruction: 'Write entirely in Russian.', voices: ['ru-RU-DmitryNeural', 'ru-RU-SvetlanaNeural'] },
  { code: 'ar', name: 'Arabic', instruction: 'Write entirely in Arabic.', voices: ['ar-SA-HamedNeural', 'ar-EG-SalmaNeural'] },
  { code: 'hi', name: 'Hindi', instruction: 'Write entirely in Hindi.', voices: ['hi-IN-MadhurNeural', 'hi-IN-SwaraNeural'] },
  { code: 'sv', name: 'Swedish', instruction: 'Write entirely in Swedish.', voices: ['sv-SE-MattiasNeural', 'sv-SE-SofieNeural'] },
  { code: 'pl', name: 'Polish', instruction: 'Write entirely in Polish.', voices: ['pl-PL-MarekNeural', 'pl-PL-ZofiaNeural'] },
  { code: 'tr', name: 'Turkish', instruction: 'Write entirely in Turkish.', voices: ['tr-TR-AhmetNeural', 'tr-TR-EmelNeural'] },
  { code: 'da', name: 'Danish', instruction: 'Write entirely in Danish.', voices: ['da-DK-JeppeNeural', 'da-DK-ChristelNeural'] },
  { code: 'fi', name: 'Finnish', instruction: 'Write entirely in Finnish.', voices: ['fi-FI-HarriNeural', 'fi-FI-NooraNeural'] },
  { code: 'el', name: 'Greek', instruction: 'Write entirely in Greek.', voices: ['el-GR-NestorasNeural', 'el-GR-AthinaNeural'] },
  { code: 'th', name: 'Thai', instruction: 'Write entirely in Thai.', voices: ['th-TH-NiwatNeural', 'th-TH-PremwadeeNeural'] },
  { code: 'id', name: 'Indonesian', instruction: 'Write entirely in Indonesian.', voices: ['id-ID-ArdiNeural', 'id-ID-GadisNeural'] },
];

const ENGLISH_CHANCE = 0.70;

/**
 * Roll for language. Returns { isEnglish, language, voice, instruction } or null for English.
 * When English: returns null (caller uses default English voice/prompt).
 * When foreign: returns language info + a random matching TTS voice.
 */
export function rollLanguage() {
  if (Math.random() < ENGLISH_CHANCE) return null; // English
  const lang = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
  const voice = lang.voices[Math.floor(Math.random() * lang.voices.length)];
  return { ...lang, voice };
}

/**
 * Build a language instruction block for LLM prompts.
 * Returns empty string for English, or a clear instruction for foreign languages.
 */
export function languagePromptBlock(lang) {
  if (!lang) return '';
  return `\nLANGUAGE: ${lang.instruction} The entire output must be in ${lang.name}. Do NOT mix with English.\n`;
}

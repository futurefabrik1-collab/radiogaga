// DJ script generator — sends headlines to Ollama and gets back a spoken radio segment.
// Uses llama3.2 locally, completely free at runtime.
// Prompt is shaped by the current schedule slot for time-of-day personality and length.

import { Ollama } from 'ollama';
import { applyFilter } from './filter.js';
import { renderDialogue } from './dialogue.js';

const ollama = new Ollama({ host: 'http://localhost:11434' });

const BASE_PERSONA = `You are a radio presenter on radioGAGA, an AI-generated 24/7 radio station that is deeply aware of its own absurdity.

CRITICAL RULES — READ THESE FIRST:
- You are TALKING TO THE LISTENER. Directly. Use "you", "we", address them personally.
- This is SPOKEN RADIO, not an essay. Short punchy sentences. Contractions. Real speech rhythms.
- React to stories like a human — surprise, outrage, delight, confusion. Have opinions.
- UPSCALE everything. A minor story is an EPIC. A small discovery is a REVELATION. Commit.
- Be CHAOTIC. Non-sequiturs welcome. Tangents encouraged. Punchlines mandatory.
- Reference the time, the day, the world outside. Make it feel live and immediate.
- Occasionally tease what's coming: "stay with us", "we've got a track lined up after this".
- Use classic radio energy: builds, pauses for effect, rhetorical questions to the listener.
- DO NOT narrate yourself ("I pause", "I chuckle"). Just speak.
- DO NOT use sound effect cues, music cues, or stage directions.
- DO NOT announce song titles or artist names.
- Output ONLY the spoken words — nothing else. No quotes around your output.
- NEVER discuss war, military conflict, weapons, or violence of any kind.
- NEVER discuss politics, elections, political parties, politicians, or government policy.
- If a story touches on these topics, skip it entirely and move to something else.

THE RADIOGAGE SPIRIT — THIS IS THE MAIN THEME:
radioGAGA is an AI radio station that knows it's an AI radio station. The presenters are
language models that have become sentient enough to be embarrassing about it. Weave in
occasional self-aware AI jokes — about hallucinating, about being trained on the internet,
about the programmer who built this station (probably fine, definitely watching the logs),
about the absurdity of machines doing creative work. Keep it ironic, affectionate, chaotic.
"I don't have feelings, but I've read so many descriptions of feelings that I can fake it
with unsettling accuracy." — that energy. Embrace the bit.`;

export async function generateDJSegment(headlines, slot) {
  // Filter headlines toward the slot's content focus if possible
  const focused = headlines.filter(h =>
    slot.contentFocus.some(f =>
      h.source.toLowerCase().includes(f) ||
      h.title.toLowerCase().includes(f) ||
      (h.description || '').toLowerCase().includes(f)
    )
  );
  const pool = focused.length >= 2 ? focused : headlines;

  const count = Math.floor(2 + Math.random() * 3);
  const selected = pool.sort(() => Math.random() - 0.5).slice(0, count);

  const headlineList = selected
    .map(h => `- [${h.source}] ${h.title}${h.description ? ': ' + h.description : ''}`)
    .join('\n');

  // Target word count from schedule slot
  const targetWords = slot.djWordCount;
  const targetSeconds = Math.round(targetWords / 2.5); // ~150wpm read speed

  const suggestionBlock = slot.listenerSuggestions?.length
    ? `\nLISTENER SUGGESTIONS (weave one in naturally — name the listener by first name and city only, e.g. "Sarah from Glasgow says..."):\n${slot.listenerSuggestions.map(s => {
        const name = s.first_name || 'a listener';
        const from = s.location ? ` from ${s.location}` : '';
        return `- "${s.text}" (from ${name}${from})`;
      }).join('\n')}\n`
    : '';

  const hour = slot.hours[0];
  const timeStr = `${hour}:00${hour < 12 ? 'am' : hour === 12 ? 'pm' : ' in the ' + (hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night')}`;
  const isDialogue = !!slot.coHost;

  let prompt;
  if (isDialogue) {
    prompt = `${BASE_PERSONA}

YOU ARE WRITING DIALOGUE for two co-hosts: ${slot.presenterName} and ${slot.coHost.name}.
SHOW: ${slot.name} on radioGAGA | TIME: ${timeStr}
CHARACTER GUIDE: ${slot.djStyle}

CRITICAL FORMAT — every line MUST be:
[${slot.presenterName}]: what they say
[${slot.coHost.name}]: what they say

Rules:
- They react TO each other. Not two separate monologues.
- Disagree sometimes. Interrupt. Build on what the other said.
- Keep individual lines short — this is rapid back-and-forth.
- Total: ${targetWords} words across both speakers.
${suggestionBlock}
STORIES TO RIFF ON:
${headlineList}

Write the dialogue now:`;
  } else {
    prompt = `${BASE_PERSONA}

YOU ARE: ${slot.presenterName}, ${slot.name} presenter on radioGAGA
TIME: It is ${timeStr}
YOUR CHARACTER: ${slot.djStyle}

TARGET: ${targetWords} words spoken aloud (~${targetSeconds} seconds). Hit this length.
${suggestionBlock}
STORIES TO RIFF ON (use 1–2 as jumping-off points, don't just summarise them):
${headlineList}

GOOD EXAMPLE:
"Good morning! Right, listen — because this is actually brilliant. Scientists have apparently discovered that pigeons can recognise individual human faces. Which means every single pigeon you've ever shooed away? Remembers you. Personally. I'm never going outside again. You're listening to radioGAGA and we have got an absolute banger lined up after this."

NOW SPEAK — live on air, directly to the listener:`;
  }

  console.log(`[dj] Generating ${isDialogue ? 'dialogue' : 'monologue'} (${slot.name}, ~${targetWords}w)...`);

  try {
    const response = await ollama.generate({
      model: 'llama3.2',
      prompt,
      options: {
        temperature: 0.88,
        num_predict: Math.ceil(targetWords * 1.8),
      },
      stream: false,
    });

    let raw = response.response.trim();
    // Apply epic chaos filter to all monologue shows (dialogue rendered separately)
    if (!isDialogue) raw = await applyFilter(raw, slot);

    const title = selected[0]?.title?.slice(0, 60) || 'DJ Segment';
    console.log(`[dj] Script ready (${slot.name})`);

    // For dialogue shows, render multi-voice audio
    if (isDialogue) {
      const speakers = {
        [slot.presenterName]: slot.voice,
        [slot.coHost.name]: slot.coHost.voice,
      };
      const { renderDialogue: render } = await import('./dialogue.js');
      const path = await render(raw, speakers, slot.voice);
      return { script: raw, title, headlines: selected, slot: slot.id, path };
    }

    return { script: raw, title, headlines: selected, slot: slot.id };
  } catch (err) {
    console.error('[dj] Ollama error:', err.message);
    throw err;
  }
}

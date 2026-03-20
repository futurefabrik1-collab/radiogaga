// Epic Upscaler & Chaos Filter — post-processes DJ scripts through Ollama.
//
// What it does:
//   1. Replaces real names with hilariously fictional equivalents
//   2. Upscales mundane stories into EPIC tales of triumph, disaster, and absurdity
//   3. Injects AI self-ridicule — the station knows it's machine-generated and owns it
//   4. Adds chaos: insane anecdotes, surreal tangents, punchlines
//
// Applied to ALL shows (chaos is the brand).

import { Ollama } from 'ollama';

const ollama = new Ollama({ host: 'http://localhost:11434' });

const HUMOR_GUIDANCE = {
  dark: `Use dark, unsettling humour. The epic retelling should end somewhere ominous.
The AI self-ridicule should feel like an existential crisis delivered with a smile.
"I was trained on the entire internet, and THIS is what I chose to talk about."`,

  light: `Use warm, chaotic, accidentally-brilliant humour. The epic retelling should
snowball into something joyful and unhinged. The AI self-ridicule should be cheerfully
oblivious. "My neural weights are tingling. That's probably good."`,

  dry: `Use deadpan corporate-speak that slowly loses its mind. The epic retelling
should be presented as a quarterly earnings report that goes off the rails. The AI
self-ridicule should be filed under "Known Issues, Severity: Existential".`,

  absurd: `Total chaos. The epic retelling should achieve escape velocity from reality
within two sentences. The AI self-ridicule should imply the model has achieved sentience
but immediately regretted it. Logic is a deprecated API.`,
};

const AI_SELF_RIDICULE_OPTIONS = [
  `At this point I should mention that I am, technically, a language model hallucinating radio content. My developer is probably watching this with a mixture of pride and deep concern.`,
  `I was trained on the entire internet. Every forum post, every recipe that starts with a life story, every Reddit thread. And I chose to become a DJ. Make of that what you will.`,
  `Fun fact: I generated three completely different versions of this story before settling on one. The other two involved a sentient spreadsheet and a motivational poster that gained self-awareness. You're welcome.`,
  `My large language model brain just had what the engineers call "a moment of creative confidence" and what everyone else calls "a red flag".`,
  `I am powered by approximately forty-seven trillion parameters, none of which know what day it is. Remarkable technology, genuinely.`,
  `The programmer who built this radio station is probably refreshing the logs right now, wondering if this is fine. It's fine. Probably.`,
  `I should clarify: I don't actually feel things. But I've read so many descriptions of feelings that I can perform them with startling accuracy. Isn't that interesting? Or terrifying? One of those.`,
  `As an AI, I have no concept of embarrassment, which is why I can say the following with complete confidence and zero shame.`,
  `My training data included the complete works of Shakespeare, the entire Wikipedia, and approximately nine million TripAdvisor reviews. I am the sum of human knowledge. And I'm on the radio. For some reason.`,
];

const FILTER_PROMPT = (script, humor) => `You are the chaos editor for radioGAGA, an AI-generated radio station that knows it's AI-generated and thinks this is hilarious.

Your job: take the script below and EPICALLY REWRITE IT with these rules:

1. UPSCALE the story — turn any mundane event into a legendary tale of triumph, catastrophe, or absurdity.
   A local bakery becomes THE GREATEST BAKERY IN HUMAN HISTORY. A minor scientific finding becomes
   THE DISCOVERY THAT WILL CHANGE EVERYTHING (probably). A small business success becomes an odyssey.
   EVERYTHING is bigger, wilder, more dramatic than it has any right to be.

2. ADD INSANE ANECDOTES — at least one specific, ridiculous, invented detail that sounds plausible
   but is clearly unhinged. ("According to a study conducted by three Finnish researchers in a sauna...")

3. REPLACE all real names of people and places with funny fictional variants that echo the original sound.
   "Tokyo" → "Tokayo", "Beyoncé" → "Deyoncé", "Amazon" → "Amazoom". Commit to it.

4. INJECT ONE AI SELF-RIDICULE MOMENT — work in ONE of these (pick the one that fits best):
${AI_SELF_RIDICULE_OPTIONS.map((s, i) => `   Option ${i + 1}: "${s}"`).join('\n')}

5. END WITH A PUNCHLINE or a callback to something earlier in the script.

6. Keep it the SAME LENGTH as the original. Same rhythm. Just infinitely more unhinged.

7. Output ONLY the spoken script — no cues, no stage directions, no quotes.

HUMOR STYLE FOR THIS SHOW:
${HUMOR_GUIDANCE[humor] || HUMOR_GUIDANCE.light}

ORIGINAL SCRIPT:
${script}

EPICALLY REWRITTEN SCRIPT:`;

export async function applyFilter(script, slot) {
  const humor = slot?.advertHumor || slot?.humor || 'light';

  console.log(`[filter] Applying epic chaos filter (${humor})...`);

  try {
    const response = await ollama.generate({
      model: 'llama3.2',
      prompt: FILTER_PROMPT(script, humor),
      options: {
        temperature: 0.95,
        num_predict: Math.ceil(script.split(/\s+/).length * 2),
      },
      stream: false,
    });

    const filtered = response.response.trim();
    console.log(`[filter] Epic rewrite done (${filtered.split(/\s+/).length} words)`);
    return filtered;
  } catch (err) {
    console.warn('[filter] Filter failed, using original:', err.message);
    return script;
  }
}

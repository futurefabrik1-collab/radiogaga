// LLM client — wraps Groq API behind the same interface as the old Ollama client.
// All content generators call ollama.generate({ model, prompt, options, stream })
// and read response.response — this adapter preserves that contract.
//
// Set GROQ_API_KEY in env. Model defaults to llama-3.3-70b-versatile.

import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';

export const ollama = {
  async generate({ prompt, options = {}, model: _model, stream: _stream } = {}) {
    const { temperature = 0.9, num_predict = 256 } = options;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: num_predict,
    });

    return { response: completion.choices[0]?.message?.content ?? '' };
  },
};

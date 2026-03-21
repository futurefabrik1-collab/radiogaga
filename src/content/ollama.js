// LLM client — wraps OpenRouter API behind the same interface as the old Ollama client.
// All content generators call ollama.generate({ model, prompt, options, stream })
// and read response.response — this adapter preserves that contract.
//
// Retry logic: on 429 (rate limit), waits and retries up to 3 times.
// On other transient errors, exponential backoff.

const API_KEY = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.LLM_MODEL || 'meta-llama/llama-3.3-70b-instruct';
const MAX_RETRIES = 3;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export const ollama = {
  async generate({ prompt, options = {}, model: _model, stream: _stream } = {}) {
    const { temperature = 0.9, num_predict = 256 } = options;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'HTTP-Referer': 'https://www.radiogaga.ai',
            'X-Title': 'radioGAGA',
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens: num_predict,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          const isRateLimit = res.status === 429;
          const isTransient = res.status >= 500;

          if (attempt === MAX_RETRIES || (!isRateLimit && !isTransient)) {
            throw new Error(`${res.status} ${body}`);
          }

          if (isRateLimit) {
            const retryAfter = res.headers.get('retry-after');
            const waitMs = retryAfter ? Math.min(parseFloat(retryAfter) * 1000, 120_000) : 30_000;
            console.log(`[llm] Rate limited, waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await sleep(waitMs);
          } else {
            const waitMs = Math.min(2000 * Math.pow(2, attempt), 30_000);
            console.log(`[llm] Transient error (${res.status}), retrying in ${Math.round(waitMs / 1000)}s`);
            await sleep(waitMs);
          }
          continue;
        }

        const data = await res.json();
        return { response: data.choices?.[0]?.message?.content ?? '' };
      } catch (err) {
        if (err.message?.startsWith('4') || err.message?.startsWith('5')) throw err;
        if (attempt === MAX_RETRIES) throw err;
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 30_000);
        console.log(`[llm] Network error (${err.code || err.message}), retrying in ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs);
      }
    }
  },
};

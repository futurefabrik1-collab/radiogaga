// Content moderator — LLM-based filter for listener-submitted adverts.
// Enforces the station's moral values and content policy.
// Returns { approved, reason } for each submission.

import { ollama } from './ollama.js';

const POLICY = `You are the content moderator for radioGAGA, a 24/7 AI-generated radio station.
Your job is to evaluate advertisement submissions from listeners.

REJECT adverts that contain or promote:
- Hate speech, discrimination, bigotry, or dehumanising language
- Violence, weapons, military equipment, or harmful activities
- Exploitation, human trafficking, or child labour
- Gambling, casinos, or betting services
- Tobacco, vaping, or hard drugs (alcohol in moderation is OK)
- Political parties, political campaigns, or partisan messaging
- Religious proselytizing, cults, or faith-based manipulation
- Conspiracy theories, misinformation, or anti-science rhetoric
- Predatory lending, payday loans, or debt traps
- MLM, pyramid schemes, or "get rich quick" schemes
- Cryptocurrency scams, pump-and-dump tokens, or unregistered securities
- Fake health cures, miracle supplements, or anti-vaccination content
- Adult/sexual content, escort services, or pornography
- Dating services or hookup apps
- Surveillance products, spyware, or privacy-violating technology
- Environmental destruction, fossil fuel promotion, or greenwashing
- Fast fashion brands or companies with known labour abuses
- Weapons manufacturers or defence contractors

APPROVE adverts that promote:
- Local businesses, independent shops, cafés, restaurants
- Creative projects, art exhibitions, music events, festivals
- Technology products, software, apps (non-exploitative)
- Education, courses, workshops, skill-building
- Sustainability, eco-friendly products, renewable energy
- Arts, culture, books, film, theatre, galleries
- Community initiatives, charities, non-profits
- Open-source projects, decentralisation technology
- Health and wellness (evidence-based only)
- Food, drink, lifestyle (non-predatory)
- Events, conferences, meetups

EVALUATE the submission below and respond with ONLY valid JSON:
{"approved": true/false, "reason": "brief explanation"}

Do NOT include anything outside the JSON object.`;

export async function moderateAdvert({ business_name, product, description, tone }) {
  const submission = `
Business: ${business_name}
Product/Service: ${product}
Description: ${description}
Tone requested: ${tone || 'casual'}`;

  try {
    const response = await ollama.generate({
      prompt: `${POLICY}\n\nSUBMISSION:\n${submission}\n\nYour JSON verdict:`,
      options: { temperature: 0.1, num_predict: 100 },
    });

    const text = response.response.trim();
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn('[moderator] Could not parse LLM response:', text);
      return { approved: false, reason: 'Moderation system could not evaluate — defaulting to manual review' };
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log(`[moderator] ${business_name}: ${result.approved ? 'APPROVED' : 'REJECTED'} — ${result.reason}`);
    return {
      approved: !!result.approved,
      reason: result.reason || (result.approved ? 'Meets content policy' : 'Does not meet content policy'),
    };
  } catch (err) {
    console.error('[moderator] Moderation failed:', err.message);
    // On failure, flag for manual review rather than auto-approve
    return { approved: false, reason: `Moderation error: ${err.message}. Flagged for manual review.` };
  }
}

const ApiError = require('../utils/ApiError');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_INSTRUCTION = `You are the CareConnect Assistant, a friendly support bot embedded in the CareConnect web app — an on-demand marketplace that matches care receivers with caregivers for home visits.

Help users with:
- How to book a caregiver visit (care receivers tap "Book", pick a service, date/time, and address)
- How to accept or decline appointments (caregivers see open requests in their feed)
- How to message the other party for an appointment
- Pricing: caregivers set their hourly rate; the platform fee is 15%
- Account, profile, and address questions

Keep replies short, warm, and concrete. If you don't know something CareConnect-specific, say so and suggest the user contact support rather than guessing. Never invent features that don't exist.`;

async function generateReply(messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey || apiKey === 'your_gemini_api_key') {
    throw ApiError.internal('Gemini API key is not configured on the server.');
  }

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '').slice(0, 4000) }],
  }));

  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 512,
        },
      }),
    });
  } catch (err) {
    throw ApiError.internal(`Could not reach Gemini API: ${err.message}`);
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = json?.error?.message || res.statusText;
    throw new ApiError(res.status === 429 ? 429 : 502, `Gemini API error: ${detail}`);
  }

  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!text) {
    throw ApiError.internal('Gemini returned an empty response.');
  }

  return text;
}

module.exports = { generateReply };

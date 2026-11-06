/**
 * lib/polsia-ai.js — Polsia AI proxy client.
 * All AI features use this, not direct API calls.
 */
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  baseURL: process.env.POLSIA_API_URL || 'https://polsia.com/api/proxy/ai',
  apiKey: process.env.POLSIA_API_KEY,
});

async function classifyAlarm(alarm, context = '') {
  const prompt = `You are a clinical alarm triage AI. Given the following alarm data, classify it and explain your reasoning.

Alarm:
- Type: ${alarm.eventType}
- Source: ${alarm.source}
- Parameter: ${alarm.param}
- Value: ${alarm.value} ${alarm.unit}
- Severity: ${alarm.severity || 'unknown'}
${context ? `- Context: ${context}` : ''}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "action": "dispatch" | "suppress" | "monitor",
  "confidence": 0-100,
  "priority_score": 0-1000,
  "reason": "one-sentence explanation",
  "suppression_category": "motion_artifact" | "baseline_shift" | "medication_related" | "device_noise" | null
}`;

  const response = await anthropic.messages.create(
    {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: process.env.POLSIA_SUBSCRIPTION_ID
        ? { 'X-Subscription-ID': process.env.POLSIA_SUBSCRIPTION_ID }
        : {},
    }
  );

  const text = response.content[0].text.trim();
  try {
    return JSON.parse(text);
  } catch {
    return {
      action: 'monitor',
      confidence: 50,
      priority_score: 500,
      reason: text.slice(0, 200),
      suppression_category: null,
    };
  }
}

module.exports = { classifyAlarm };
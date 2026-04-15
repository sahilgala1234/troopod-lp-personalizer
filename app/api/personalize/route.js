import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Model cascade: try in order until one works
// gemini-1.5-flash has the most generous free-tier quota (RPM/RPD)
const MODEL_CASCADE = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
];

// ── Retry helper ───────────────────────────────────────────────────────────

async function generateWithRetry(params, maxRetries = 2) {
  let lastError;

  for (const model of MODEL_CASCADE) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          ...params,
          model,
        });
        return response; // success
      } catch (err) {
        lastError = err;
        const msg = err?.message || '';
        const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');

        if (is429) {
          // Extract retry delay from error if available (e.g. "retry in 24.99s")
          const retryMatch = msg.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
          const waitMs = retryMatch ? Math.min(parseFloat(retryMatch[1]) * 1000, 8000) : 3000;

          if (attempt < maxRetries) {
            console.warn(`[personalize] 429 on ${model}, waiting ${waitMs}ms before retry ${attempt + 1}…`);
            await new Promise((r) => setTimeout(r, waitMs));
          } else {
            console.warn(`[personalize] 429 quota exhausted on ${model}, trying next model…`);
            break; // try next model
          }
        } else {
          // Non-quota error — throw immediately
          throw err;
        }
      }
    }
  }

  // All models exhausted
  throw new Error(
    'QUOTA_EXHAUSTED: All Gemini models have reached their free-tier quota limit. ' +
    'Please enable billing at https://aistudio.google.com or wait a few minutes and try again.'
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchLandingPage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; TroopodBot/1.0; +https://troopod.io)',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return html;
  } catch (err) {
    throw new Error(`Could not fetch landing page: ${err.message}`);
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 5000); // tighter cap → fewer tokens → more quota-friendly
}

function injectPersonalization(originalHtml, changes) {
  let html = originalHtml;

  // Patch page title
  if (changes.pageTitle) {
    html = html.replace(
      /<title>[^<]*<\/title>/i,
      `<title>${changes.pageTitle}</title>`
    );
  }

  // Inject personalization banner
  const bannerHtml = `
<div id="tp-personalizer-banner" style="
  position: fixed; bottom: 20px; right: 20px; z-index: 99999;
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  color: white; padding: 10px 16px; border-radius: 12px;
  font-family: Inter, system-ui, sans-serif; font-size: 12px; font-weight: 700;
  box-shadow: 0 8px 32px rgba(139,92,246,0.4); letter-spacing: 0.5px;
  display: flex; align-items: center; gap: 8px; cursor: default;
  animation: tp-float 3s ease-in-out infinite;
">
  <span>⚡</span>
  <span>Personalized by Troopod AI</span>
</div>
<style>
@keyframes tp-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
</style>
`;
  html = html.replace(/<\/body>/i, `${bannerHtml}</body>`);

  // Apply text replacements (safe — no-op if text not found)
  if (changes.replacements && Array.isArray(changes.replacements)) {
    for (const { original, replacement } of changes.replacements) {
      if (!original || !replacement) continue;
      const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        html = html.replace(new RegExp(escaped, 'g'), replacement);
      } catch (_) {
        // Skip invalid patterns silently
      }
    }
  }

  return html;
}

function validateHtml(html) {
  if (!html || html.length < 200) return false;
  const lower = html.toLowerCase();
  return lower.includes('<html') || lower.includes('<body') || lower.includes('<!doctype');
}

// ── Main Handler ──────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const formData = await request.formData();
    const lpUrl = formData.get('lpUrl');
    const adImageUrl = formData.get('adImageUrl');
    const adImageFile = formData.get('adImage');

    if (!lpUrl) {
      return NextResponse.json({ error: 'Landing page URL is required.' }, { status: 400 });
    }
    if (!adImageUrl && !adImageFile) {
      return NextResponse.json({ error: 'Ad creative is required.' }, { status: 400 });
    }

    // ── Step 1: Fetch landing page ─────────────────────────────────────
    const originalHtml = await fetchLandingPage(lpUrl);
    const lpText = htmlToText(originalHtml);

    // ── Step 2: Prepare ad image ───────────────────────────────────────
    let imagePart;
    if (adImageFile && typeof adImageFile === 'object' && adImageFile.size > 0) {
      const bytes = await adImageFile.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      imagePart = {
        inlineData: {
          data: base64,
          mimeType: adImageFile.type || 'image/jpeg',
        },
      };
    } else if (adImageUrl) {
      const imgRes = await fetch(adImageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TroopodBot/1.0)' },
      });
      if (!imgRes.ok) throw new Error('Could not fetch ad image URL.');
      const imgBuffer = await imgRes.arrayBuffer();
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      imagePart = {
        inlineData: {
          data: Buffer.from(imgBuffer).toString('base64'),
          mimeType: contentType,
        },
      };
    }

    // ── Step 3: Analyze ad creative (with retry + model cascade) ──────
    const analysisPrompt = `You are an expert performance marketer and CRO specialist.

Analyze this ad creative image and extract the following in JSON format (respond ONLY with valid JSON, no markdown fences):

{
  "offer": "The specific product, service, or value proposition being advertised",
  "headline": "The main headline or key message visible in the ad",
  "audience": "Target audience persona (e.g., 'startup founders', 'fitness enthusiasts')",
  "tone": "Tone of the ad (e.g., 'urgent', 'aspirational', 'professional', 'playful')",
  "keyBenefit": "The #1 benefit or transformation promised",
  "cta": "The call-to-action text from the ad if visible, otherwise suggest one",
  "emotionalHook": "The emotional trigger or pain point being addressed",
  "urgency": "Any urgency or scarcity element present (or null if none)"
}`;

    const analysisResponse = await generateWithRetry({
      contents: [
        {
          role: 'user',
          parts: [imagePart, { text: analysisPrompt }],
        },
      ],
    });

    let adAnalysis;
    try {
      const rawText = analysisResponse.candidates[0].content.parts[0].text;
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      adAnalysis = JSON.parse(cleaned);
    } catch (_) {
      // Graceful fallback so the pipeline continues
      adAnalysis = {
        offer: 'Premium product/service',
        headline: 'Transform your results',
        audience: 'professionals and businesses',
        tone: 'professional and aspirational',
        keyBenefit: 'Save time and increase conversions',
        cta: 'Get Started Free',
        emotionalHook: 'Fear of missing out on growth',
        urgency: null,
      };
    }

    // ── Step 4: Generate personalization plan (text-only — cheaper) ───
    const personalizationPrompt = `You are an elite CRO (Conversion Rate Optimization) specialist.

AD CREATIVE ANALYSIS:
${JSON.stringify(adAnalysis, null, 2)}

EXISTING LANDING PAGE TEXT (truncated):
${lpText}

TASK: Create a personalization plan to align this landing page with the ad creative.
The goal is message match — users clicking the ad should see a page that feels like a natural continuation.

Apply these CRO principles:
1. Message Match: Hero headline must echo the ad's key message
2. Above-the-fold CTA: Primary CTA matches the ad's CTA
3. Benefit-first copy: Lead with the #1 benefit from the ad
4. Urgency alignment: If the ad has urgency, reflect it on the page
5. Audience language: Use vocabulary resonant with the target audience

Respond ONLY with valid JSON (no markdown fences, no extra text):
{
  "pageTitle": "New SEO-optimized page title aligned to the ad",
  "adInsights": {
    "offer": "...",
    "audience": "...",
    "keyMessage": "...",
    "tone": "..."
  },
  "cro_changes": [
    {
      "type": "hero|cta|copy|trust|visual",
      "description": "Human-readable description of this change",
      "rationale": "Why this improves conversion for this ad audience"
    }
  ],
  "replacements": [
    {
      "original": "exact text to find in the HTML (must appear verbatim, at least 5 chars)",
      "replacement": "new personalized text to replace it with"
    }
  ]
}

Generate 5-8 targeted text replacements. Focus on: h1, h2, primary CTA buttons, hero subheadlines, nav CTAs.`;

    const personalizationResponse = await generateWithRetry({
      contents: [
        {
          role: 'user',
          parts: [{ text: personalizationPrompt }],
        },
      ],
    });

    let personalizationPlan;
    try {
      const rawText = personalizationResponse.candidates[0].content.parts[0].text;
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      personalizationPlan = JSON.parse(cleaned);
    } catch (_) {
      throw new Error('AI returned an invalid response. Please try again.');
    }

    // ── Step 5: Apply + validate ──────────────────────────────────────
    const personalizedHtml = injectPersonalization(originalHtml, {
      pageTitle: personalizationPlan.pageTitle,
      replacements: personalizationPlan.replacements || [],
    });

    if (!validateHtml(personalizedHtml)) {
      throw new Error('Generated page failed validation. The source page may not be accessible.');
    }

    return NextResponse.json({
      success: true,
      originalUrl: lpUrl,
      adAnalysis,
      personalizationPlan,
      personalizedHtml,
      originalHtml,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[personalize] error:', err);

    // User-friendly quota error message
    const msg = err?.message || '';
    if (msg.startsWith('QUOTA_EXHAUSTED') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json(
        {
          error:
            'The Gemini API free-tier quota is exhausted. Please enable billing at https://aistudio.google.com/apikey and try again, or wait a few minutes for the rate limit to reset.',
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: msg || 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

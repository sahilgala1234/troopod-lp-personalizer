import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  // Very light HTML stripping — preserves text content for LLM context
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 6000); // cap for token budget
}

function extractBodyContent(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

function injectPersonalization(originalHtml, changes) {
  /**
   * Strategy:
   * 1. We do targeted text replacements based on Gemini's change plan.
   * 2. We also inject a personalization banner above the fold.
   * 3. We patch <title> if needed.
   * All changes are conservative — we never remove DOM structure.
   */
  let html = originalHtml;

  // Patch page title
  if (changes.pageTitle) {
    html = html.replace(
      /<title>[^<]*<\/title>/i,
      `<title>${changes.pageTitle}</title>`
    );
  }

  // Inject personalization banner (above the fold, before </body>)
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

  // Apply text replacements
  if (changes.replacements && Array.isArray(changes.replacements)) {
    for (const { original, replacement } of changes.replacements) {
      if (!original || !replacement) continue;
      // Escape special regex chars in the original string
      const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        const re = new RegExp(escaped, 'g');
        html = html.replace(re, replacement);
      } catch (_) {
        // Skip invalid patterns silently
      }
    }
  }

  return html;
}

function validateHtml(html) {
  // Basic sanity: must have html/body tags, must be substantial
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

    // ── Step 2: Prepare ad image for Gemini ───────────────────────────
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
      // Fetch image from URL and convert to base64
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

    // ── Step 3: Gemini — Analyze ad creative ──────────────────────────
    const analysisPrompt = `You are an expert performance marketer and CRO specialist.

Analyze this ad creative image and extract the following in JSON format (respond ONLY with valid JSON, no markdown):

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

    const analysisResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            imagePart,
            { text: analysisPrompt },
          ],
        },
      ],
    });

    let adAnalysis;
    try {
      const rawText = analysisResponse.candidates[0].content.parts[0].text;
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      adAnalysis = JSON.parse(cleaned);
    } catch (parseErr) {
      // Fallback: extract what we can
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

    // ── Step 4: Gemini — Generate personalization plan ────────────────
    const personalizationPrompt = `You are an elite CRO (Conversion Rate Optimization) specialist.

AD CREATIVE ANALYSIS:
${JSON.stringify(adAnalysis, null, 2)}

EXISTING LANDING PAGE TEXT (truncated):
${lpText}

TASK: Create a personalization plan to align this landing page with the ad creative.
The goal is message match — users clicking the ad should see a page that feels like a natural continuation.

Apply these CRO principles:
1. **Message Match**: Hero headline must echo the ad's key message
2. **Above-the-fold CTA**: Ensure the primary CTA matches the ad's CTA
3. **Benefit-first copy**: Lead with the #1 benefit from the ad
4. **Urgency alignment**: If the ad has urgency, reflect it on the page
5. **Audience language**: Use words/phrases resonant with the target audience

Respond ONLY with this exact JSON structure (no markdown code fences):
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
      "original": "exact text to find in the HTML (be specific, at least 5 chars)",
      "replacement": "new personalized text to replace it with"
    }
  ]
}

Generate 5-10 targeted text replacements. Each 'original' field must be exact text that appears in the landing page.
Focus on: h1, h2, primary CTA buttons, hero subheadlines, nav CTAs, and above-the-fold copy.`;

    const personalizationResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
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
    } catch (parseErr) {
      throw new Error('AI returned invalid personalization plan. Please try again.');
    }

    // ── Step 5: Apply changes to HTML ────────────────────────────────
    const personalizedHtml = injectPersonalization(originalHtml, {
      pageTitle: personalizationPlan.pageTitle,
      replacements: personalizationPlan.replacements || [],
    });

    // ── Step 6: Validate output ───────────────────────────────────────
    if (!validateHtml(personalizedHtml)) {
      throw new Error('Generated page failed validation. The source page may not be accessible.');
    }

    // ── Return result ─────────────────────────────────────────────────
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
    return NextResponse.json(
      { error: err.message || 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

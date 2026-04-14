'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const CHANGE_TYPE_MAP = {
  hero: 'hero',
  cta: 'cta',
  copy: 'copy',
  trust: 'trust',
  visual: 'visual',
};

export default function ResultPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('split'); // 'split' | 'personalized' | 'original'
  const iframeRef = useRef(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('personalization_result');
      if (!stored) {
        router.replace('/');
        return;
      }
      setData(JSON.parse(stored));
    } catch {
      router.replace('/');
    }
  }, [router]);

  useEffect(() => {
    if (!data) return;
    // Write personalized HTML into iframe via srcdoc
  }, [data, activeTab]);

  const downloadHtml = () => {
    if (!data?.personalizedHtml) return;
    const blob = new Blob([data.personalizedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'personalized-landing-page.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyHtml = async () => {
    if (!data?.personalizedHtml) return;
    await navigator.clipboard.writeText(data?.personalizedHtml);
    alert('HTML copied to clipboard!');
  };

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
          <div>Loading result…</div>
        </div>
      </div>
    );
  }

  const { adAnalysis, personalizationPlan, personalizedHtml, originalHtml, originalUrl } = data;
  const changes = personalizationPlan?.cro_changes || [];
  const replacements = personalizationPlan?.replacements || [];

  return (
    <>
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-logo">
          <div className="logo-icon">⚡</div>
          <span>Troopod</span>
        </div>
        <button
          type="button"
          onClick={() => router.push('/')}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 16px',
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'var(--transition)',
          }}
        >
          ← New Personalization
        </button>
      </nav>

      {/* Header */}
      <div className="result-header">
        <h1 className="result-title">
          ✅ Page Personalized
        </h1>
        <p className="result-subtitle">
          {replacements.length} text replacements applied · Aligned to your ad creative
        </p>

        {/* Ad insight tags */}
        <div className="result-tags">
          {adAnalysis?.audience && (
            <span className="result-tag">👥 {adAnalysis.audience}</span>
          )}
          {adAnalysis?.tone && (
            <span className="result-tag">🎭 {adAnalysis.tone}</span>
          )}
          {adAnalysis?.offer && (
            <span className="result-tag">💡 {adAnalysis.offer.slice(0, 40)}</span>
          )}
          {adAnalysis?.urgency && (
            <span className="result-tag">⏰ {adAnalysis.urgency}</span>
          )}
        </div>

        {/* Actions */}
        <div className="result-actions">
          <button className="btn-action primary" onClick={downloadHtml} id="download-html-btn">
            ⬇️ Download HTML
          </button>
          <button className="btn-action secondary" onClick={copyHtml} id="copy-html-btn">
            📋 Copy HTML
          </button>
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-action secondary"
            id="view-original-btn"
          >
            🌐 View Original
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-wrapper">
        <div className="tabs" role="tablist">
          <button
            className={`tab-btn ${activeTab === 'split' ? 'active' : ''}`}
            onClick={() => setActiveTab('split')}
            role="tab"
            id="tab-split"
          >
            Side-by-Side
          </button>
          <button
            className={`tab-btn ${activeTab === 'personalized' ? 'active' : ''}`}
            onClick={() => setActiveTab('personalized')}
            role="tab"
            id="tab-personalized"
          >
            ⚡ Personalized
          </button>
          <button
            className={`tab-btn ${activeTab === 'original' ? 'active' : ''}`}
            onClick={() => setActiveTab('original')}
            role="tab"
            id="tab-original"
          >
            Original
          </button>
          <button
            className={`tab-btn ${activeTab === 'insights' ? 'active' : ''}`}
            onClick={() => setActiveTab('insights')}
            role="tab"
            id="tab-insights"
          >
            📊 AI Insights
          </button>
        </div>
      </div>

      {/* Preview Section */}
      {activeTab !== 'insights' && (
        <div className="preview-section">
          <div className="preview-container">
            {activeTab === 'split' && (
              <div className="split-view">
                {/* Original */}
                <div className="preview-panel">
                  <div className="preview-panel-header">
                    <div className="preview-panel-title">
                      <span className="dot-original" />
                      Original Page
                    </div>
                    <div className="browser-bar">
                      <div className="browser-dot" />
                      <div className="browser-dot" />
                      <div className="browser-dot" />
                    </div>
                  </div>
                  <iframe
                    srcDoc={originalHtml}
                    className="preview-iframe"
                    title="Original landing page"
                    sandbox="allow-scripts allow-same-origin"
                    id="original-iframe"
                  />
                </div>
                {/* Personalized */}
                <div className="preview-panel">
                  <div className="preview-panel-header">
                    <div className="preview-panel-title">
                      <span className="dot-personalized" />
                      Personalized Page
                    </div>
                    <div className="browser-bar">
                      <div className="browser-dot" />
                      <div className="browser-dot" />
                      <div className="browser-dot" />
                    </div>
                  </div>
                  <iframe
                    srcDoc={personalizedHtml}
                    className="preview-iframe"
                    title="Personalized landing page"
                    sandbox="allow-scripts allow-same-origin"
                    id="personalized-iframe"
                  />
                </div>
              </div>
            )}

            {activeTab === 'personalized' && (
              <div className="preview-panel">
                <div className="preview-panel-header">
                  <div className="preview-panel-title">
                    <span className="dot-personalized" />
                    Personalized Page — Full View
                  </div>
                  <div className="browser-bar">
                    <div className="browser-dot" />
                    <div className="browser-dot" />
                    <div className="browser-dot" />
                  </div>
                </div>
                <iframe
                  srcDoc={personalizedHtml}
                  className="preview-full"
                  title="Personalized full view"
                  sandbox="allow-scripts allow-same-origin"
                  id="personalized-full-iframe"
                />
              </div>
            )}

            {activeTab === 'original' && (
              <div className="preview-panel">
                <div className="preview-panel-header">
                  <div className="preview-panel-title">
                    <span className="dot-original" />
                    Original Page — Full View
                  </div>
                  <div className="browser-bar">
                    <div className="browser-dot" />
                    <div className="browser-dot" />
                    <div className="browser-dot" />
                  </div>
                </div>
                <iframe
                  srcDoc={originalHtml}
                  className="preview-full"
                  title="Original full view"
                  sandbox="allow-scripts allow-same-origin"
                  id="original-full-iframe"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <div className="insights-section">
          <div className="insights-container">
            {/* Ad analysis cards */}
            <div className="insights-grid">
              <div className="insight-card">
                <div className="insight-label">Offer Detected</div>
                <div className="insight-value">{adAnalysis?.offer || '—'}</div>
              </div>
              <div className="insight-card">
                <div className="insight-label">Target Audience</div>
                <div className="insight-value">{adAnalysis?.audience || '—'}</div>
              </div>
              <div className="insight-card">
                <div className="insight-label">Emotional Hook</div>
                <div className="insight-value">{adAnalysis?.emotionalHook || '—'}</div>
              </div>
              <div className="insight-card">
                <div className="insight-label">Key Benefit</div>
                <div className="insight-value">{adAnalysis?.keyBenefit || '—'}</div>
              </div>
              <div className="insight-card">
                <div className="insight-label">Ad CTA</div>
                <div className="insight-value">{adAnalysis?.cta || '—'}</div>
              </div>
              <div className="insight-card">
                <div className="insight-label">Urgency Signal</div>
                <div className="insight-value">{adAnalysis?.urgency || 'None detected'}</div>
              </div>
            </div>

            {/* CRO Changes */}
            <div className="changes-list">
              <div className="changes-list-title">
                CRO Changes Applied ({changes.length + replacements.length})
              </div>

              {changes.map((change, i) => (
                <div className="change-item" key={`change-${i}`}>
                  <span className={`change-badge ${CHANGE_TYPE_MAP[change.type] || 'copy'}`}>
                    {change.type}
                  </span>
                  <div className="change-text">
                    <strong>{change.description}</strong>
                    {change.rationale && (
                      <div style={{ marginTop: 2, fontStyle: 'italic', opacity: 0.8 }}>
                        → {change.rationale}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {replacements.length > 0 && (
                <>
                  <div style={{ padding: '12px 0 4px', fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Text Replacements
                  </div>
                  {replacements.map((r, i) => (
                    <div className="change-item" key={`rep-${i}`}>
                      <span className="change-badge copy">copy</span>
                      <div className="change-text">
                        <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>{r.original?.slice(0, 60)}</span>
                        {' → '}
                        <strong>{r.replacement?.slice(0, 80)}</strong>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        Built for Troopod · Powered by Gemini AI · PM Assignment 2026
      </footer>
    </>
  );
}

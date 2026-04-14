'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const LOADING_STEPS = [
  { id: 'fetch', label: 'Fetching landing page content' },
  { id: 'analyze', label: 'Analyzing ad creative with Gemini' },
  { id: 'extract', label: 'Extracting key messages & audience intent' },
  { id: 'personalize', label: 'Generating CRO-optimized personalization' },
  { id: 'validate', label: 'Validating output & safety checks' },
];

export default function HomePage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [adUrl, setAdUrl] = useState('');
  const [lpUrl, setLpUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreviewSrc(e.target.result);
    reader.readAsDataURL(file);
    setAdUrl('');
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, []);

  const removeFile = () => {
    setUploadedFile(null);
    setPreviewSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const simulateProgress = () => {
    let step = 0;
    const delays = [800, 1400, 1000, 2000, 800];
    const advance = () => {
      if (step < LOADING_STEPS.length - 1) {
        step++;
        setLoadingStep(step);
        setTimeout(advance, delays[step]);
      }
    };
    setTimeout(advance, delays[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!lpUrl.trim()) {
      setError('Please enter a landing page URL.');
      return;
    }
    if (!uploadedFile && !adUrl.trim()) {
      setError('Please upload an ad image or enter an ad image URL.');
      return;
    }

    setLoading(true);
    setLoadingStep(0);
    simulateProgress();

    try {
      const formData = new FormData();
      formData.append('lpUrl', lpUrl.trim());
      if (uploadedFile) {
        formData.append('adImage', uploadedFile);
      } else {
        formData.append('adImageUrl', adUrl.trim());
      }

      const res = await fetch('/api/personalize', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Personalization failed. Please try again.');
      }

      // Store result in sessionStorage
      sessionStorage.setItem('personalization_result', JSON.stringify(data));
      router.push('/result');
    } catch (err) {
      setLoading(false);
      setError(err.message);
    }
  };

  return (
    <>
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-logo">
          <div className="logo-icon">⚡</div>
          <span>Troopod</span>
        </div>
        <span className="navbar-badge">LP Personalizer</span>
      </nav>

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-logo">⚡</div>
          <div className="loading-title">Personalizing your page…</div>
          <div className="loading-steps">
            {LOADING_STEPS.map((step, i) => (
              <div
                key={step.id}
                className={`loading-step ${i < loadingStep ? 'done' : i === loadingStep ? 'active' : ''}`}
              >
                <div className="loading-step-icon">
                  {i < loadingStep ? '✓' : i === loadingStep ? (
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: '2px solid var(--accent-purple)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                  ) : ''}
                </div>
                {step.label}
              </div>
            ))}
          </div>
          <div className="loading-bar">
            <div
              className="loading-bar-fill"
              style={{ width: `${Math.round(((loadingStep + 1) / LOADING_STEPS.length) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="hero">
        <div className="hero-eyebrow">
          <span className="dot" />
          Powered by Gemini AI
        </div>
        <h1>
          Turn Ad Creatives into<br />
          <span className="gradient-text">Personalized Landing Pages</span>
        </h1>
        <p>
          Paste your landing page URL and upload your ad creative.
          Our AI analyzes the ad's message, audience, and tone — then enhances
          your page with CRO principles to maximize conversions.
        </p>
      </section>

      {/* Form */}
      <section className="form-section">
        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-grid">
            {/* Ad Creative Input */}
            <div className="form-group">
              <label className="form-label">
                <span className="label-icon">🎨</span>
                Ad Creative — Upload Image
              </label>

              {previewSrc ? (
                <div className="upload-preview">
                  <img src={previewSrc} alt="Ad preview" />
                  <div className="upload-preview-info">
                    <div className="upload-preview-name">{uploadedFile?.name}</div>
                    <div className="upload-preview-size">
                      {uploadedFile ? `${(uploadedFile.size / 1024).toFixed(1)} KB` : ''}
                    </div>
                  </div>
                  <button type="button" className="upload-preview-remove" onClick={removeFile}>×</button>
                </div>
              ) : (
                <div
                  className={`upload-zone ${dragging ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  <span className="upload-icon">🖼️</span>
                  <div className="upload-title">Drag & drop your ad</div>
                  <div className="upload-sub">or <span>click to browse</span> · PNG, JPG, WebP</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    id="ad-image-upload"
                    onChange={(e) => handleFile(e.target.files[0])}
                  />
                </div>
              )}

              <div className="or-divider">or paste URL</div>

              <input
                type="url"
                className="form-input"
                id="ad-image-url"
                placeholder="https://cdn.example.com/ad-creative.jpg"
                value={adUrl}
                onChange={(e) => { setAdUrl(e.target.value); setUploadedFile(null); setPreviewSrc(null); }}
                disabled={!!uploadedFile}
              />
            </div>

            {/* Landing Page URL */}
            <div className="form-group">
              <label className="form-label">
                <span className="label-icon">🌐</span>
                Landing Page URL
              </label>
              <input
                type="url"
                className="form-input"
                id="landing-page-url"
                placeholder="https://example.com/landing"
                value={lpUrl}
                onChange={(e) => setLpUrl(e.target.value)}
                required
                style={{ marginBottom: 0 }}
              />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5, paddingLeft: 2 }}>
                We'll fetch this page and personalize its copy, headlines, and CTAs to match your ad message.
              </p>

              {/* Quick Examples */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
                  Try an example
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    'https://www.shopify.com',
                    'https://www.notion.so',
                    'https://linear.app',
                  ].map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setLpUrl(url)}
                      style={{
                        background: 'rgba(139,92,246,0.05)',
                        border: '1px solid rgba(139,92,246,0.15)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        color: 'var(--accent-purple)',
                        fontSize: 12,
                        fontFamily: 'var(--font-sans)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'var(--transition)',
                      }}
                    >
                      {url}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 20,
              fontSize: 13,
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" className="btn-submit" disabled={loading} id="generate-btn">
            {loading ? (
              <>
                <div className="spinner" />
                Generating…
              </>
            ) : (
              <>
                ⚡ Generate Personalized Page
              </>
            )}
          </button>
        </form>
      </section>

      {/* How It Works */}
      <section className="how-section">
        <div className="container">
          <div className="section-title">How It Works</div>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-num">1</div>
              <div className="step-title">Input Your Creative</div>
              <div className="step-desc">Upload your ad image or paste a URL. Our AI reads the visual, headline, and offer.</div>
            </div>
            <div className="step-card">
              <div className="step-num">2</div>
              <div className="step-title">AI Analyzes Intent</div>
              <div className="step-desc">Gemini extracts the offer, audience persona, tone, and key CRO signals from the ad.</div>
            </div>
            <div className="step-card">
              <div className="step-num">3</div>
              <div className="step-title">Page Personalized</div>
              <div className="step-desc">Your existing landing page is enhanced — same structure, new copy aligned to the ad message.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        Built for Troopod · Powered by Gemini AI · PM Assignment 2026
      </footer>
    </>
  );
}

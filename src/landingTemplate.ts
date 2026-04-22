// Adapted version of https://github.com/Stremio/stremio-addon-sdk/blob/v1.6.2/src/landingTemplate.js
import { CustomManifest } from './types';
import { envGet } from './utils';
import { LOGO_BLUE } from './logo';

export function landingTemplate(manifest: CustomManifest) {
  // Always use inlined base64 logo for <img> tags — works on any host
  const inlineLogo = LOGO_BLUE;

  // Build config form — only language checkboxes remain
  let formFields = '';
  let script = '';

  if ((manifest.config || []).length) {
    manifest.config.forEach((elem) => {
      const key = elem.key;
      if (elem.type === 'checkbox') {
        const isChecked = elem.default === 'checked' ? ' checked' : '';
        formFields += `
        <div class="field-group checkbox-group">
          <label class="checkbox-label" for="${key}">
            <input type="checkbox" id="${key}" name="${key}"${isChecked}/>
            <span>${elem.title}</span>
          </label>
        </div>`;
      }
    });

    if (formFields.length) {
      script += `
        installLink.onclick = () => true;
        const updateLink = () => {
          const config = Object.fromEntries(new FormData(mainForm));
          installLink.href = 'stremio://' + window.location.host + '/' + encodeURIComponent(JSON.stringify(config)) + '/manifest.json';
        };
        mainForm.onchange = updateLink;
      `;
    }
  }

  const formHTML = formFields.length ? `
    <form id="mainForm" autocomplete="off">
      ${formFields}
    </form>` : '';

  const configEnvDesc = envGet('CONFIGURATION_DESCRIPTION') || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>WatchNow – Stremio Add-on</title>
  <meta name="description" content="WatchNow Stremio Add-on – stream Movies &amp; Series in 4K, 1080p and more. Powered by DevStreams."/>
  <link rel="icon" type="image/png" href="${inlineLogo}"/>
  <link rel="apple-touch-icon" href="${inlineLogo}"/>
  <link rel="shortcut icon" href="${inlineLogo}"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --blue: #2563EB;
      --blue-light: #3B82F6;
      --blue-glow: rgba(37,99,235,0.35);
      --bg: #060b18;
      --card: rgba(255,255,255,0.04);
      --border: rgba(255,255,255,0.08);
      --text: #f0f4ff;
      --muted: rgba(240,244,255,0.55);
      --radius: 16px;
    }

    html, body {
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 15px;
      line-height: 1.6;
    }

    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 60% at 20% -10%, rgba(37,99,235,0.22) 0%, transparent 60%),
        radial-gradient(ellipse 60% 50% at 90% 100%, rgba(59,130,246,0.15) 0%, transparent 60%);
      pointer-events: none;
      z-index: 0;
    }

    .page {
      position: relative;
      z-index: 1;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 20px 80px;
    }

    /* ── hero ── */
    .hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      margin-bottom: 40px;
      text-align: center;
    }

    .hero-logo {
      width: 96px;
      height: 96px;
      border-radius: 24px;
      box-shadow: 0 0 0 2px var(--blue), 0 8px 40px var(--blue-glow);
      object-fit: cover;
      animation: pulse-glow 3s ease-in-out infinite;
    }

    @keyframes pulse-glow {
      0%, 100% { box-shadow: 0 0 0 2px var(--blue), 0 8px 40px var(--blue-glow); }
      50%       { box-shadow: 0 0 0 3px var(--blue-light), 0 8px 56px rgba(59,130,246,0.5); }
    }

    .hero-title {
      font-size: 2.6rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #fff 30%, var(--blue-light) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero-sub {
      font-size: 1rem;
      color: var(--muted);
      max-width: 420px;
    }

    .badge-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-top: 4px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 12px;
      border-radius: 99px;
      font-size: 0.78rem;
      font-weight: 600;
      background: rgba(37,99,235,0.15);
      border: 1px solid rgba(37,99,235,0.35);
      color: var(--blue-light);
    }

    /* ── card ── */
    .card {
      width: 100%;
      max-width: 520px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 28px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      margin-bottom: 20px;
    }

    .card-title {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--blue-light);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 7px;
    }

    /* ── features ── */
    .features { display: flex; flex-direction: column; gap: 12px; }

    .feature-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .feature-icon { font-size: 1.25rem; flex-shrink: 0; margin-top: 1px; }

    .feature-text strong {
      display: block;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text);
    }

    .feature-text span { font-size: 0.8rem; color: var(--muted); }

    /* ── stream preview ── */
    .stream-preview {
      background: rgba(0,0,0,0.4);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 0.82rem;
      line-height: 1.75;
      color: #c7d7ff;
    }

    .sp-name { font-weight: 700; color: var(--blue-light); }

    /* ── language grid ── */
    .lang-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.88rem;
      cursor: pointer;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid transparent;
      transition: border-color 0.15s, background 0.15s;
    }

    .checkbox-label:hover {
      background: rgba(37,99,235,0.08);
      border-color: rgba(37,99,235,0.25);
    }

    .checkbox-label input[type="checkbox"] {
      accent-color: var(--blue);
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    /* ── install button ── */
    .install-btn-wrap {
      width: 100%;
      max-width: 520px;
      margin-bottom: 20px;
    }

    .install-link { text-decoration: none; display: block; }

    .install-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 16px;
      background: var(--blue);
      border: none;
      border-radius: var(--radius);
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow: 0 4px 24px var(--blue-glow);
      transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
    }

    .install-btn:hover {
      background: var(--blue-light);
      box-shadow: 0 6px 32px rgba(59,130,246,0.5);
    }

    .install-btn:active { transform: scale(0.98); }

    .btn-logo {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      object-fit: cover;
    }

    /* ── divider ── */
    .divider {
      width: 100%;
      max-width: 520px;
      height: 1px;
      background: var(--border);
      margin: 4px 0 20px;
    }

    /* ── powered by ── */
    .powered-by {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 0.78rem;
      text-align: center;
    }

    .powered-by a {
      color: var(--blue-light);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s;
    }

    .powered-by a:hover { color: #fff; }

    /* ── left sidebar tab ── */
    .side-tab {
      position: fixed;
      left: 0;
      top: 50%;
      transform: translateY(-50%) rotate(-90deg);
      transform-origin: left center;
      z-index: 100;
      background: var(--blue);
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      text-decoration: none;
      padding: 8px 18px;
      border-radius: 0 0 10px 10px;
      box-shadow: 2px 2px 12px var(--blue-glow);
      white-space: nowrap;
      transition: background 0.2s, box-shadow 0.2s;
      margin-left: -1px;
    }

    .side-tab:hover {
      background: var(--blue-light);
      box-shadow: 2px 2px 20px rgba(59,130,246,0.5);
    }
  </style>
</head>
<body>
<div class="page">

  <!-- LEFT SIDE TAB -->
  <a href="https://dev-streamz-navy.vercel.app/configure" target="_blank" rel="noopener" class="side-tab"
     title="More Addons by DevStreamz">More Addons by DevStreamz</a>

  <!-- HERO -->
  <div class="hero">
    <img src="${inlineLogo}" alt="WatchNow Logo" class="hero-logo"/>
    <h1 class="hero-title">WatchNow</h1>
    <p class="hero-sub">A premium Stremio add-on delivering Movies &amp; Series streams with rich quality metadata.</p>
    <div class="badge-row">
      <span class="badge">🔥 4K UHD</span>
      <span class="badge">💎 1080p FHD</span>
      <span class="badge">🎞️ 720p HD</span>
      <span class="badge">🎬 Movies &amp; Series</span>
      <span class="badge">🌍 Multi-language</span>
    </div>
  </div>

  <!-- FEATURES -->
  <div class="card">
    <div class="card-title">✦ About This Add-on</div>
    <div class="features">
      <div class="feature-item">
        <span class="feature-icon">🎥</span>
        <div class="feature-text">
          <strong>Multi-source Streaming</strong>
          <span>Pulls streams from 4KHDHub, HDHub4u, and Showbox simultaneously.</span>
        </div>
      </div>
      <div class="feature-item">
        <span class="feature-icon">📊</span>
        <div class="feature-text">
          <strong>Rich Stream Metadata</strong>
          <span>Every stream shows quality, codec, audio format, file size, bitrate &amp; language flags.</span>
        </div>
      </div>
      <div class="feature-item">
        <span class="feature-icon">⚡</span>
        <div class="feature-text">
          <strong>Smart Caching</strong>
          <span>Results are cached for 12 hours so repeated lookups are instant.</span>
        </div>
      </div>
      <div class="feature-item">
        <span class="feature-icon">🌍</span>
        <div class="feature-text">
          <strong>Multi-language Support</strong>
          <span>Enable specific language tracks below before installing.</span>
        </div>
      </div>
    </div>
  </div>

  <!-- STREAM PREVIEW -->
  <div class="card">
    <div class="card-title">🖥️ Stream Card Preview</div>
    <div class="stream-preview">
      <span class="sp-name">WatchNow</span><br/>
      <span class="sp-name">🔥 4K UHD</span><br/>
      ──────────────────────<br/>
      🎥 BluRay 📺 DV 🎞️ HEVC<br/>
      🎧 Atmos | TrueHD 🔊 7.1 🗣️ 🇬🇧 / 🇮🇳<br/>
      📦 62.5 GB / 📊 54.8 Mbps<br/>
      🏷️ GROUP 📡 RARBG<br/>
      🔍 HubCloud from 4KHDHub
    </div>
  </div>

  ${formHTML ? `
  <!-- LANGUAGE CONFIG -->
  <div class="card">
    <div class="card-title">🌍 Languages</div>
    ${configEnvDesc ? `<p style="font-size:0.82rem;color:var(--muted);margin-bottom:16px">${configEnvDesc}</p>` : ''}
    <div class="lang-grid">
      ${formHTML}
    </div>
  </div>` : ''}

  <div class="divider"></div>

  <!-- INSTALL BUTTON -->
  <div class="install-btn-wrap">
    <a id="installLink" class="install-link" href="#">
      <button class="install-btn" name="Install">
        <img src="${inlineLogo}" alt="" class="btn-logo"/>
        Add to Stremio
      </button>
    </a>
  </div>

  <!-- POWERED BY -->
  <div class="powered-by">
    <span>Powered by <a href="https://dev-streamz-navy.vercel.app/configure" target="_blank" rel="noopener">DevStreams</a></span>
    <span>v${manifest.version || '1.14.0'} &nbsp;·&nbsp; <a href="https://dev-streamz-navy.vercel.app/configure" target="_blank" rel="noopener">More Addons by DevStreamz →</a></span>
  </div>

</div>

<script>
  (function() {
    var installLink = document.getElementById('installLink');
    var form = document.getElementById('mainForm');

    function buildUrl() {
      var base = 'stremio://' + window.location.host;
      if (form) {
        var config = {};
        var data = new FormData(form);
        data.forEach(function(val, key) { config[key] = val; });
        if (Object.keys(config).length > 0) {
          return base + '/' + encodeURIComponent(JSON.stringify(config)) + '/manifest.json';
        }
      }
      return base + '/manifest.json';
    }

    function updateLink() {
      installLink.href = buildUrl();
    }

    updateLink();
    if (form) form.addEventListener('change', updateLink);
  })();
</script>
</body>
</html>`;
}

// Zero-dependency OIDC Authorization Code Flow + PKCE client for Authentik

const STORAGE_PREFIX = 'socialeye_oidc_';
const TOKEN_KEY = `${STORAGE_PREFIX}tokens`;
const PKCE_KEY = `${STORAGE_PREFIX}pkce`;

let cachedConfig = null;
let cachedDiscovery = null;

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomString(length = 48) {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export async function getAuthConfig() {
  if (cachedConfig) return cachedConfig;
  const res = await fetch('/api/auth/config');
  if (!res.ok) {
    throw new Error('Failed to load authentication configuration');
  }
  cachedConfig = await res.json();
  return cachedConfig;
}

async function getOidcDiscovery(issuer) {
  if (cachedDiscovery) return cachedDiscovery;
  const base = issuer.replace(/\/+$/, '');
  const res = await fetch(`${base}/.well-known/openid-configuration`);
  if (!res.ok) {
    throw new Error('ไม่สามารถเชื่อมต่อระบบยืนยันตัวตน Authentik ได้');
  }
  cachedDiscovery = await res.json();
  return cachedDiscovery;
}

export function getStoredTokens() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTokens(tokenResponse) {
  const expiresIn = Number(tokenResponse.expires_in || 28800);
  const tokens = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || null,
    id_token: tokenResponse.id_token || null,
    expires_at: Date.now() + expiresIn * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  return tokens;
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(PKCE_KEY);
}

export async function startLogin() {
  const cfg = await getAuthConfig();
  if (!cfg.auth_enabled) return;

  const discovery = await getOidcDiscovery(cfg.issuer);
  const state = generateRandomString(24);
  const codeVerifier = generateRandomString(48);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const redirectUri = `${window.location.origin}/`;

  sessionStorage.setItem(
    PKCE_KEY,
    JSON.stringify({ state, codeVerifier, redirectUri })
  );

  const params = new URLSearchParams({
    client_id: cfg.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email groups offline_access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `${discovery.authorization_endpoint}?${params.toString()}`;
}

export async function handleOidcCallbackIfPresent() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  const error = urlParams.get('error');

  if (error) {
    const desc = urlParams.get('error_description') || error;
    window.history.replaceState({}, document.title, window.location.pathname);
    throw new Error(`การเข้าสู่ระบบถูกปฏิเสธ: ${desc}`);
  }

  if (!code) return false;

  const rawPkce = sessionStorage.getItem(PKCE_KEY);
  if (!rawPkce) {
    window.history.replaceState({}, document.title, window.location.pathname);
    throw new Error('ไม่พบข้อมูล PKCE session กรุณากดเข้าสู่ระบบใหม่อีกครั้ง');
  }

  const pkce = JSON.parse(rawPkce);
  if (pkce.state !== state) {
    sessionStorage.removeItem(PKCE_KEY);
    window.history.replaceState({}, document.title, window.location.pathname);
    throw new Error('สถานะ OIDC state ไม่ตรงกัน (CSRF protection)');
  }

  const cfg = await getAuthConfig();
  const discovery = await getOidcDiscovery(cfg.issuer);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.client_id,
    code,
    redirect_uri: pkce.redirectUri,
    code_verifier: pkce.codeVerifier,
  });

  const tokenRes = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  sessionStorage.removeItem(PKCE_KEY);
  window.history.replaceState({}, document.title, window.location.pathname);

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`แลกเปลี่ยน Token ไม่สำเร็จ: ${errText}`);
  }

  const tokenData = await tokenRes.json();
  saveTokens(tokenData);
  return true;
}

async function refreshAccessTokenIfNeeded() {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  // Still valid with 60s buffer
  if (tokens.expires_at && Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    clearTokens();
    return null;
  }

  try {
    const cfg = await getAuthConfig();
    const discovery = await getOidcDiscovery(cfg.issuer);
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: cfg.client_id,
      refresh_token: tokens.refresh_token,
    });
    const res = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      clearTokens();
      return null;
    }
    const newTokens = saveTokens(await res.json());
    return newTokens.access_token;
  } catch {
    clearTokens();
    return null;
  }
}

export async function authFetch(url, options = {}) {
  const cfg = await getAuthConfig();
  const headers = new Headers(options.headers || {});

  if (cfg.auth_enabled) {
    const token = await refreshAccessTokenIfNeeded();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && cfg.auth_enabled) {
    clearTokens();
  }
  return res;
}

export async function logout() {
  const tokens = getStoredTokens();
  clearTokens();

  try {
    const cfg = await getAuthConfig();
    if (!cfg.auth_enabled) {
      window.location.reload();
      return;
    }
    const discovery = await getOidcDiscovery(cfg.issuer);
    if (discovery.end_session_endpoint) {
      const params = new URLSearchParams({
        post_logout_redirect_uri: `${window.location.origin}/`,
      });
      if (tokens?.id_token) {
        params.set('id_token_hint', tokens.id_token);
      }
      window.location.href = `${discovery.end_session_endpoint}?${params.toString()}`;
      return;
    }
  } catch {
    // Fallback reload
  }
  window.location.reload();
}

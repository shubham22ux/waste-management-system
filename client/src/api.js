export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Returns the fully resolved API URL for an endpoint
 * @param {string} endpoint
 * @returns {string}
 */
export function getApiUrl(endpoint) {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${cleanEndpoint}`;
}

export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('smartwaste_token');

  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = getApiUrl(endpoint);
  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // Clear invalid token and trigger redirect event if unauthenticated
    localStorage.removeItem('smartwaste_token');
    localStorage.removeItem('smartwaste_user');
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  return response;
}

export async function safeParseJson(response, defaultMsg = 'Request failed') {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const rawText = await response.text();
    if (rawText.includes('<!doctype') || rawText.includes('<html') || rawText.includes('<!DOCTYPE')) {
      throw new Error(
        'Backend API is not reachable on this domain. If hosted on AWS Amplify, please configure VITE_API_URL in your Amplify Environment Variables to point to your live backend server.'
      );
    }
    try {
      return JSON.parse(rawText);
    } catch {
      throw new Error(rawText || defaultMsg);
    }
  }
  return response.json();
}


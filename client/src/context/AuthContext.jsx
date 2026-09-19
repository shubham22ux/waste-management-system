import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch, getApiUrl, safeParseJson } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('smartwaste_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('smartwaste_token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyUser = async () => {
      if (token) {
        try {
          const res = await apiFetch('/api/auth/me');
          if (res.ok) {
            const userData = await safeParseJson(res);
            setUser(userData);
            localStorage.setItem('smartwaste_user', JSON.stringify(userData));
          } else {
            logout();
          }
        } catch {
          logout();
        }
      } else {
        setUser(null);
        localStorage.removeItem('smartwaste_user');
      }
      setLoading(false);
    };

    verifyUser();
  }, [token]);

  /**
   * Login with email + password.
   * Returns:
   *   - For citizens: { id, name, email, role, ... } (user object, logged in directly)
   *   - For admin/driver: { requireOtp: true, tempToken, maskedEmail, role, message }
   */
  const login = async (email, password) => {
    const res = await fetch(getApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await safeParseJson(res, 'Login failed.');
    if (!res.ok) {
      throw new Error(data.error || 'Login failed.');
    }

    // If OTP is required (admin/driver), return the response without setting auth state
    if (data.requireOtp) {
      return data;
    }

    // Citizen direct login
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('smartwaste_token', data.token);
    localStorage.setItem('smartwaste_user', JSON.stringify(data.user));
    return data.user;
  };

  /**
   * Verify OTP code with optional temp token for security.
   * Returns the authenticated user object.
   */
  const verifyLoginOtp = async (email, otp, tempToken = null) => {
    const body = { email, otp };
    if (tempToken) {
      body.tempToken = tempToken;
    }

    const res = await fetch(getApiUrl('/api/auth/verify-otp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await safeParseJson(res, 'Invalid or expired verification code.');
    if (!res.ok) {
      throw new Error(data.error || 'Invalid or expired verification code.');
    }

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('smartwaste_token', data.token);
    localStorage.setItem('smartwaste_user', JSON.stringify(data.user));
    return data.user;
  };

  /**
   * Request a fresh OTP (for resend). Returns response data including a new tempToken.
   */
  const requestLoginOtp = async (email, password = null) => {
    const res = await fetch(getApiUrl('/api/auth/request-otp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await safeParseJson(res, 'Failed to dispatch verification code.');
    if (!res.ok) {
      throw new Error(data.error || 'Failed to dispatch verification code.');
    }
    return data;
  };

  const register = async (name, email, password, phone) => {
    const res = await fetch(getApiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, phone })
    });

    const data = await safeParseJson(res, 'Registration failed.');
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed.');
    }

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('smartwaste_token', data.token);
    localStorage.setItem('smartwaste_user', JSON.stringify(data.user));
    return data.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('smartwaste_token');
    localStorage.removeItem('smartwaste_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, requestLoginOtp, verifyLoginOtp, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

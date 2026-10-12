'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/components/ClientProvider';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { Globe, Loader2, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const { lang, setLang } = useAppState();
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const res = await signIn(email, password);
    setSubmitting(false);
    if (res.ok) router.replace('/');
    else setError(t('incorrectCredentials', lang));
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted">…</div>;
  if (user) return null;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="flex justify-end p-4">
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-shaki-lavender text-sm font-medium text-shaki-purple hover:bg-shaki-soft"
        >
          <Globe className="w-4 h-4" />
          {lang === 'zh' ? 'EN' : '中文'}
        </button>
      </div>

      <div className="flex-1 grid place-items-center px-6 pb-20">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-shaki-purple text-white font-bold flex items-center justify-center text-lg mb-3">
              S
            </div>
            <h1 className="text-xl font-semibold text-ink">{t('appTitle', lang)}</h1>
            <p className="text-sm text-muted mt-1">{t('appSubtitle', lang)}</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-card border border-shaki-lavender shadow-sm p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-2">{t('email', lang)}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@company.com"
                className="w-full px-4 py-3 rounded-btn border border-gray-200 focus:border-shaki-purple focus:ring-2 focus:ring-shaki-purple/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-2">{t('password', lang)}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••"
                className="w-full px-4 py-3 rounded-btn border border-gray-200 focus:border-shaki-purple focus:ring-2 focus:ring-shaki-purple/20 outline-none"
              />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-shaki-purple text-white font-semibold rounded-btn hover:bg-shaki-purple2 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('signingIn', lang)}
                </>
              ) : (
                <>
                  {t('signIn', lang)}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center">
              <button type="button" className="text-sm text-muted hover:text-shaki-purple">
                {t('forgotPassword', lang)}
              </button>
            </div>
          </form>

          {!process.env.NEXT_PUBLIC_SUPABASE_URL && (
            <p className="text-center text-xs text-muted mt-4">
              {lang === 'zh' ? '演示模式：任意有效邮箱 + 密码（≥4 位）即可登录' : 'Demo mode: any valid email + password (≥4 chars) signs in'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { RouteLoading } from '@/components/RouteLoading';
import { ProposalDocument } from '@/components/ProposalDocument';
import { ArrowLeft, Printer, Copy, Check, Share2 } from 'lucide-react';

function PreviewContent() {
  const { lang, proposals } = useAppState();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const proposal = proposals.find((p) => p.id === id);
  const [copied, setCopied] = useState(false);

  if (!proposal) {
    return (
      <AppShell title={t('proposalPreview', lang)}>
        <div className="text-center py-20 text-muted">{t('noData', lang)}</div>
      </AppShell>
    );
  }

  const shareUrl =
    proposal.shareUrl ||
    (typeof window !== 'undefined' ? `${window.location.origin}/share?id=${proposal.id}` : `/share?id=${proposal.id}`);

  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppShell title={t('proposalPreview', lang)}>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <Link
          href={`/proposal?id=${proposal.id}`}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-shaki-purple"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('editProposal', lang)}
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-2 px-4 py-2 border border-shaki-lavender text-shaki-deep text-sm font-medium rounded-btn hover:bg-shaki-soft"
          >
            {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            {copied ? t('linkCopied', lang) : t('copyLink', lang)}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-shaki-purple text-white text-sm font-medium rounded-btn hover:bg-shaki-purple2"
          >
            <Printer className="w-4 h-4" />
            {t('downloadPdf', lang)}
          </button>
          <Link
            href={`/share?id=${proposal.id}`}
            target="_blank"
            className="inline-flex items-center gap-2 px-4 py-2 border border-shaki-lavender text-shaki-deep text-sm font-medium rounded-btn hover:bg-shaki-soft"
          >
            <Share2 className="w-4 h-4" />
            {t('openShare', lang)}
          </Link>
        </div>
      </div>

      <ProposalDocument proposal={proposal} />
    </AppShell>
  );
}

export default function ProposalPreviewPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <PreviewContent />
    </Suspense>
  );
}

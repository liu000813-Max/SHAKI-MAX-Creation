'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAppState } from '@/components/ClientProvider';

// Backward-compatible redirect: the old combined /client page is now split into
// P05 Client Intelligence and P06 Recommendations per the UI/UX spec page map.
function ClientRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { clients } = useAppState();
  const id = searchParams.get('id');

  useEffect(() => {
    const target = id
      ? `/client-intelligence?id=${id}`
      : clients[0]
        ? `/client-intelligence?id=${clients[0].id}`
        : '/analyze';
    router.replace(target);
  }, [id, clients, router]);

  return <div className="p-10 text-center text-muted">…</div>;
}

export default function ClientPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">…</div>}>
      <ClientRedirect />
    </Suspense>
  );
}

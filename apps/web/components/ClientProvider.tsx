'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { ClientInput, ClientProfile, EnrichmentEntry, Lang, Product, Proposal, Recommendation, SiteFacts } from '@/lib/types';
import { analyzeClient, generateRecommendations } from '@/lib/matching';
import { LIBRARY_VERSION } from '@/lib/data/products';
import { buildShareUrl, SHARE_PAYLOAD_VERSION, type SharedProfile } from '@/lib/shareLink';

interface AppState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  clients: ClientProfile[];
  /** `facts` is null when the official website was not (or could not be) fetched. */
  addClient: (input: ClientInput, facts?: SiteFacts | null) => ClientProfile;
  getClient: (id: string) => ClientProfile | undefined;
  recommendations: Record<string, Recommendation[]>;
  getRecommendations: (clientId: string) => Recommendation[];
  proposals: Proposal[];
  createProposal: (clientId: string, products: Recommendation[], type: Proposal['type'], companyName?: string) => Proposal;
  getProposal: (id: string) => Proposal | undefined;
  toggleProposalProduct: (proposalId: string, rec: Recommendation) => void;
  updateProposal: (id: string, patch: Partial<Proposal>) => void;
  shareProposal: (id: string) => string | undefined;
  /** PM-enriched candidate rows — the extra scoring pool (see lib/data/enrichment.ts). */
  enrichment: EnrichmentEntry[];
  saveEnrichment: (entry: EnrichmentEntry) => void;
  removeEnrichment: (productId: string) => void;
  enrichedProducts: () => Product[];
}

const ClientContext = createContext<AppState | null>(null);

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh');
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation[]>>({});
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [enrichment, setEnrichment] = useState<EnrichmentEntry[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedLang = localStorage.getItem('shaki_lang') as Lang | null;
    const navLang = navigator.language;
    if (storedLang) {
      setLangState(storedLang);
    } else if (navLang.startsWith('zh')) {
      setLangState('zh');
    } else {
      setLangState('en');
    }

    const storedClients = localStorage.getItem('shaki_clients');
    const storedRecommendations = localStorage.getItem('shaki_recommendations');
    const storedProposals = localStorage.getItem('shaki_proposals');
    const storedEnrichment = localStorage.getItem('shaki_enrichment');

    // Anything derived from the library (scores, names, product snapshots) goes stale the moment
    // the library is edited. A returning browser would otherwise render yesterday's product names
    // next to today's descriptions — which reads as a product that does not exist. Clients are the
    // rep's own input and survive; everything derived is either recomputed by the deterministic
    // engine or rebuilt from the current library.
    const libraryChanged = localStorage.getItem('shaki_library_version') !== String(LIBRARY_VERSION);

    const parsedClients: ClientProfile[] = storedClients ? JSON.parse(storedClients) : [];
    const extraPool: Product[] = storedEnrichment
      ? (JSON.parse(storedEnrichment) as EnrichmentEntry[]).map((e) => e.product)
      : [];

    if (storedClients) setClients(parsedClients);
    if (storedEnrichment) setEnrichment(JSON.parse(storedEnrichment));

    if (libraryChanged) {
      const recsByClient: Record<string, Recommendation[]> = {};
      for (const c of parsedClients) {
        recsByClient[c.id] = generateRecommendations(c, lang, extraPool);
      }
      setRecommendations(recsByClient);

      // Proposals embed product snapshots. Rebuild them from the fresh recommendations so the
      // rep's proposal work survives a library edit with current names and scores, instead of
      // being silently dropped or kept stale.
      if (storedProposals) {
        const fresh = new Map<string, Recommendation>();
        for (const recs of Object.values(recsByClient)) {
          for (const r of recs) fresh.set(r.product_id, r);
        }
        const rebuilt = (JSON.parse(storedProposals) as Proposal[]).map((p) => ({
          ...p,
          products: p.products
            .map((r) => fresh.get(r.product_id))
            .filter((r): r is Recommendation => Boolean(r)),
        }));
        setProposals(rebuilt);
      }
    } else {
      if (storedRecommendations) setRecommendations(JSON.parse(storedRecommendations));
      if (storedProposals) setProposals(JSON.parse(storedProposals));
    }

    localStorage.setItem('shaki_library_version', String(LIBRARY_VERSION));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('shaki_clients', JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('shaki_recommendations', JSON.stringify(recommendations));
  }, [recommendations]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('shaki_proposals', JSON.stringify(proposals));
  }, [proposals]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('shaki_enrichment', JSON.stringify(enrichment));
  }, [enrichment]);

  const setLang = (lang: Lang) => {
    setLangState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('shaki_lang', lang);
    }
  };

  /**
   * @param facts Page facts from the official-site fetcher, or null when the site was not read.
   *              Null is the honest default; the profile then rests on rep-entered input alone.
   */
  const addClient = (input: ClientInput, facts: SiteFacts | null = null) => {
    const profile = analyzeClient(input, lang, facts);
    const recs = generateRecommendations(profile, lang, enrichedProducts());
    setClients((prev) => [profile, ...prev]);
    setRecommendations((prev) => ({ ...prev, [profile.id]: recs }));
    return profile;
  };

  const enrichedProducts = () => enrichment.map((e) => e.product);

  const saveEnrichment = (entry: EnrichmentEntry) => {
    setEnrichment((prev) => {
      const rest = prev.filter((e) => e.product_id !== entry.product_id);
      return [entry, ...rest];
    });
  };

  const removeEnrichment = (productId: string) => {
    setEnrichment((prev) => prev.filter((e) => e.product_id !== productId));
  };

  const getClient = (id: string) => clients.find((c) => c.id === id);

  const getRecommendations = (clientId: string) => recommendations[clientId] || [];

  const createProposal = (clientId: string, products: Recommendation[], type: Proposal['type'], companyName?: string) => {
    const client = getClient(clientId);
    if (!client) throw new Error('Client not found');

    const proposal: Proposal = {
      id: Math.random().toString(36).substring(2, 10).toUpperCase(),
      clientId,
      clientName: client.name,
      companyName: companyName?.trim() || undefined,
      language: lang,
      products,
      type,
      status: 'Draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setProposals((prev) => [proposal, ...prev]);
    return proposal;
  };

  const getProposal = (id: string) => proposals.find((p) => p.id === id);

  const toggleProposalProduct = (proposalId: string, rec: Recommendation) => {
    setProposals((prev) =>
      prev.map((p) => {
        if (p.id !== proposalId) return p;
        const exists = p.products.some((rp) => rp.product_id === rec.product_id);
        const products = exists
          ? p.products.filter((rp) => rp.product_id !== rec.product_id)
          : [...p.products, rec];
        return { ...p, products, updatedAt: new Date().toISOString() };
      })
    );
  };

  const updateProposal = (id: string, patch: Partial<Proposal>) => {
    setProposals((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
      )
    );
  };

  const shareProposal = (id: string) => {
    if (typeof window === 'undefined') return undefined;
    const proposal = proposals.find((x) => x.id === id);
    const client = proposal ? getClient(proposal.clientId) : undefined;
    // Both are required. `/share?id=<id>` only resolved against this browser's localStorage, so a
    // link cut that way opened as a blank page for the recipient — the proposal and the client it
    // was computed from now travel in the fragment instead.
    if (!proposal || !client) return undefined;
    const { opportunities, ...cl } = client;
    const url = buildShareUrl(window.location.origin, {
      v: SHARE_PAYLOAD_VERSION,
      id: proposal.id,
      ti: proposal.title,
      ty: proposal.type,
      co: proposal.companyName,
      l: proposal.language,
      cl: cl as SharedProfile,
      ids: proposal.products.map((r) => r.product_id),
      at: proposal.createdAt,
    });
    setProposals((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, shareUrl: url, status: 'Sent', updatedAt: new Date().toISOString() }
          : p
      )
    );
    return url;
  };

  return (
    <ClientContext.Provider
      value={{
        lang,
        setLang,
        clients,
        addClient,
        getClient,
        recommendations,
        getRecommendations,
        proposals,
        createProposal,
        getProposal,
        toggleProposalProduct,
        updateProposal,
        shareProposal,
        enrichment,
        saveEnrichment,
        removeEnrichment,
        enrichedProducts,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useAppState must be used within ClientProvider');
  return ctx;
}

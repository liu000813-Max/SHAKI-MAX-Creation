'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { ClientInput, ClientProfile, Lang, Product, Proposal, Recommendation } from '@/lib/types';
import { analyzeClient, generateRecommendations } from '@/lib/matching';

interface AppState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  clients: ClientProfile[];
  addClient: (input: ClientInput) => ClientProfile;
  getClient: (id: string) => ClientProfile | undefined;
  recommendations: Record<string, Recommendation[]>;
  getRecommendations: (clientId: string) => Recommendation[];
  proposals: Proposal[];
  createProposal: (clientId: string, products: Recommendation[], type: Proposal['type'], companyName?: string) => Proposal;
  getProposal: (id: string) => Proposal | undefined;
  toggleProposalProduct: (proposalId: string, rec: Recommendation) => void;
}

const ClientContext = createContext<AppState | null>(null);

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh');
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation[]>>({});
  const [proposals, setProposals] = useState<Proposal[]>([]);

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

    if (storedClients) setClients(JSON.parse(storedClients));
    if (storedRecommendations) setRecommendations(JSON.parse(storedRecommendations));
    if (storedProposals) setProposals(JSON.parse(storedProposals));
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

  const setLang = (lang: Lang) => {
    setLangState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('shaki_lang', lang);
    }
  };

  const addClient = (input: ClientInput) => {
    const profile = analyzeClient(input, lang);
    const recs = generateRecommendations(profile, lang);
    setClients((prev) => [profile, ...prev]);
    setRecommendations((prev) => ({ ...prev, [profile.id]: recs }));
    return profile;
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

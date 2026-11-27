import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ApiClientProvider } from './api/ApiClientProvider';
import { ApiError } from './api/client';
import { AuthProvider } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { ConfigContext, type AppConfig } from './config';
import { ArchivePage } from './pages/Archive';
import { CompareOffersPage } from './pages/CompareOffers';
import { EditOfferPage } from './pages/EditOffer';
import { InterviewDetailPage } from './pages/InterviewDetail';
import { LeadsPage } from './pages/Leads';
import { NewInterviewPage } from './pages/NewInterview';
import { NewOpportunityPage } from './pages/NewOpportunity';
import { OffersPage } from './pages/Offers';
import { OpportunityDetailPage } from './pages/OpportunityDetail';
import { OverviewPage } from './pages/Overview';
import { SettingsPage } from './pages/Settings';
import { NotFoundPage } from './pages/NotFound';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="archive" element={<ArchivePage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="offers" element={<OffersPage />} />
        <Route path="offers/compare" element={<CompareOffersPage />} />
        <Route path="opportunities/new" element={<NewOpportunityPage />} />
        <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
        <Route path="opportunities/:id/offer" element={<EditOfferPage />} />
        <Route path="opportunities/:id/interviews/new" element={<NewInterviewPage />} />
        <Route path="opportunities/:id/interviews/:interviewId" element={<InterviewDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

// Retry a failed request once, but only for network or server errors (HTTP 0 or 5xx).
// Retrying "not found" or a validation error would just fail again.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const retryable = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
  return retryable && failureCount < 1;
}

// Data stays fresh for 30 seconds. Changes made in this app update or invalidate the cache
// right away, so the only staleness is edits from another device.
export const STALE_TIME_MS = 30_000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false, staleTime: STALE_TIME_MS },
    },
  });
}

export function App({ config }: { config: AppConfig }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <ConfigContext.Provider value={config}>
      <AuthProvider>
        <ApiClientProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </QueryClientProvider>
        </ApiClientProvider>
      </AuthProvider>
    </ConfigContext.Provider>
  );
}

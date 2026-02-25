'use client';

import { useState, useEffect } from 'react';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import {
  Loader2,
  Globe,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface Account {
  id: string;
  name: string;
  slug: string;
}

interface ScrapeResultData {
  pagesDiscovered: number;
  pagesScraped: number;
  capped: boolean;
  sectionsFound: number;
  documentsUploaded: number;
  categories: Record<
    string,
    { fileId: string; charCount: number; sourcePages: string[] }
  >;
  totalFiles: number;
  queryToolId?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  'clinic-info': 'Clinic Information',
  services: 'Services & Procedures',
  insurance: 'Insurance & Coverage',
  providers: 'Doctors & Providers',
  policies: 'Office Policies',
  faqs: 'FAQs',
};

export default function AdminKnowledgeScraperPage() {
  const csrfToken = useCsrfToken();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResultData | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/admin/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();
      setAccounts(data.accounts || data || []);
    } catch (err) {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async () => {
    if (!selectedAccountId) {
      toast.error('Please select an account');
      return;
    }
    if (!websiteUrl.trim()) {
      toast.error('Please enter a website URL');
      return;
    }

    let url = websiteUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
      setWebsiteUrl(url);
    }

    setIsScraping(true);
    setScrapeResult(null);
    setError(null);

    try {
      const res = await fetch('/api/agent/knowledge/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          websiteUrl: url,
          accountId: selectedAccountId,
        }),
      });

      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ error: 'Scrape failed' }));
        throw new Error(errData.error || `Scrape failed (${res.status})`);
      }

      const result: ScrapeResultData = await res.json();
      setScrapeResult(result);
      toast.success(
        `Scraped ${result.pagesScraped} pages, created ${result.documentsUploaded} KB documents`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to scrape website';
      setError(message);
      toast.error(message);
    } finally {
      setIsScraping(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Knowledge Base Scraper
        </h1>
        <p className="text-muted-foreground mt-1">
          Scrape a client&apos;s website and auto-generate knowledge base
          documents organized by category.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Scrape Website
          </CardTitle>
          <CardDescription>
            Select an account, enter their website URL, and the scraper will
            discover pages, extract content, and use AI to categorize it into
            knowledge base documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account</Label>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading accounts...
                </div>
              ) : (
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  disabled={isScraping}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select an account...</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.slug})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Website URL</Label>
              <Input
                type="url"
                placeholder="https://www.example-clinic.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={isScraping}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isScraping) handleScrape();
                }}
              />
            </div>
          </div>

          <Button
            onClick={handleScrape}
            disabled={isScraping || !selectedAccountId || !websiteUrl.trim()}
            className="w-full sm:w-auto"
          >
            {isScraping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scraping & Categorizing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Scrape & Upload
              </>
            )}
          </Button>

          {isScraping && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground animate-pulse">
              This may take a few minutes depending on the size of the website.
              Discovering pages, extracting content, and categorizing with AI...
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 ring-1 ring-destructive/20 px-4 py-3 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <span className="text-destructive">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {scrapeResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Scrape Complete
            </CardTitle>
            <CardDescription>
              {selectedAccount?.name && (
                <span className="font-medium">{selectedAccount.name}</span>
              )}{' '}
              — {websiteUrl}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold">
                  {scrapeResult.pagesDiscovered}
                </div>
                <div className="text-xs text-muted-foreground">
                  Pages Found
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold">
                  {scrapeResult.pagesScraped}
                </div>
                <div className="text-xs text-muted-foreground">
                  Pages Scraped
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold">
                  {scrapeResult.sectionsFound}
                </div>
                <div className="text-xs text-muted-foreground">
                  Sections Extracted
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold">
                  {scrapeResult.documentsUploaded}
                </div>
                <div className="text-xs text-muted-foreground">
                  Docs Uploaded
                </div>
              </div>
            </div>

            {scrapeResult.capped && (
              <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Page limit reached (50 max). Some pages were not scraped.
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Documents by Category</h4>
              <div className="space-y-1.5">
                {Object.entries(scrapeResult.categories).map(
                  ([catId, catData]) => (
                    <div
                      key={catId}
                      className="flex items-center gap-3 rounded-lg bg-muted/30 ring-1 ring-border/30 px-3 py-2"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                          {CATEGORY_LABELS[catId] || catId}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {(catData.charCount / 1024).toFixed(1)} KB from{' '}
                          {catData.sourcePages.length} page
                          {catData.sourcePages.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <code className="text-[10px] text-muted-foreground font-mono">
                        {catData.fileId.slice(0, 12)}...
                      </code>
                    </div>
                  ),
                )}
              </div>
            </div>

            {scrapeResult.queryToolId && (
              <div className="text-xs text-muted-foreground">
                Query Tool ID:{' '}
                <code className="font-mono">{scrapeResult.queryToolId}</code>
                {' — '}
                Total files in KB: {scrapeResult.totalFiles}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

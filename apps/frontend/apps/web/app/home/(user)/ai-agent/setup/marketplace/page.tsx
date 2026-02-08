'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Star, Download, ArrowRight, Search, Check } from 'lucide-react';
import { toast } from 'sonner';

interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  category: string;
  rating: number;
  installs: number;
  author: string;
  features: string[];
  tags: string[];
  voiceId?: string;
  includesWorkflows: boolean;
  includesActions: boolean;
  includedCustomObjects: string[];
}

export default function MarketplacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subAccountId = searchParams.get('subAccountId');

  const [selectedAgent, setSelectedAgent] = useState<MarketplaceAgent | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  // Fetch marketplace agents
  const { data: agentsData, isLoading } = useQuery({
    queryKey: ['marketplace-agents', { category: category !== 'all' ? category : undefined, search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category !== 'all') params.append('category', category);
      if (search) params.append('search', search);

      const response = await fetch(
        `/api/ghl/marketplace/agents?${params.toString()}`,
        {
          credentials: 'include',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to fetch marketplace agents');
      }

      return response.json();
    },
  });

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['marketplace-categories'],
    queryFn: async () => {
      const response = await fetch('/api/ghl/marketplace/categories', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }

      return response.json();
    },
  });

  if (!subAccountId) {
    return (
      <div className="container max-w-6xl py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-500">Error: Sub-account ID is required</p>
            <Button onClick={() => router.push('/home/ai-agent/setup')} className="mt-4">
              Back to Start
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleInstallAgent = () => {
    if (!selectedAgent) {
      toast.error('Please select an agent');
      return;
    }

    console.log('📦 Marketplace Agent Selected:', {
      id: selectedAgent.id,
      name: selectedAgent.name,
      defaultVoice: selectedAgent.voiceId,
      category: selectedAgent.category,
      includesWorkflows: selectedAgent.includesWorkflows,
      includesActions: selectedAgent.includesActions,
      featuresCount: selectedAgent.features.length,
    });

    // Store selected agent and proceed to customization
    sessionStorage.setItem('marketplaceAgent', JSON.stringify(selectedAgent));
    toast.success(`Installing ${selectedAgent.name}...`);
    router.push(`/home/ai-agent/setup/customize?subAccountId=${subAccountId}&type=marketplace`);
  };

  const agents = agentsData?.agents || [];
  const categories = categoriesData?.categories || [];

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Browse Marketplace Agents</h1>
        <p className="text-muted-foreground mt-2">
          Install a pre-built agent and customize it for your business
        </p>
      </div>

      {/* Filters */}
      <div className="grid md:grid-cols-[1fr_250px] gap-4 mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat: string) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Agent Grid */}
      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading agents...</p>
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No agents found matching your criteria</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {agents.map((agent: MarketplaceAgent) => (
            <Card
              key={agent.id}
              className={`cursor-pointer transition-all ${
                selectedAgent?.id === agent.id
                  ? 'ring-2 ring-primary border-primary'
                  : 'hover:border-primary/50'
              }`}
              onClick={() => setSelectedAgent(agent)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    <CardDescription className="text-sm mt-1">{agent.author}</CardDescription>
                  </div>
                  {selectedAgent?.id === agent.id && (
                    <div className="rounded-full bg-primary text-white p-1">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm mt-3">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium">{agent.rating}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Download className="h-4 w-4" />
                    <span>{agent.installs.toLocaleString()}</span>
                  </div>
                </div>

                <Badge variant="secondary" className="w-fit mt-2">
                  {agent.category}
                </Badge>
              </CardHeader>

              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{agent.description}</p>

                <div className="space-y-2">
                  <p className="text-xs font-medium">Key Features:</p>
                  <ul className="space-y-1">
                    {agent.features.slice(0, 3).map((feature, idx) => (
                      <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                        <Check className="h-3 w-3 text-green-600 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {agent.features.length > 3 && (
                      <li className="text-xs text-muted-foreground">
                        +{agent.features.length - 3} more
                      </li>
                    )}
                  </ul>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <div className="flex flex-wrap gap-1">
                    {agent.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {agent.includesWorkflows && (
                  <div className="mt-3 text-xs text-green-600 font-medium">
                    ✓ Includes pre-built workflows
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between bg-background border-t pt-6">
        <Button variant="outline" onClick={() => router.push(`/home/ai-agent/setup/agent-type?subAccountId=${subAccountId}`)}>
          Back
        </Button>

        <Button onClick={handleInstallAgent} disabled={!selectedAgent}>
          Install & Customize
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Selected Agent Details (Optional Preview) */}
      {selectedAgent && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{selectedAgent.name} - Full Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2">All Features ({selectedAgent.features.length})</h3>
                <ul className="space-y-2">
                  {selectedAgent.features.map((feature, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-medium mb-2">Included Components</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Workflows:</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedAgent.includesWorkflows ? 'Pre-configured workflows included' : 'No workflows'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Actions:</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedAgent.includesActions ? 'Pre-configured actions included' : 'No actions'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Custom Objects:</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedAgent.includedCustomObjects.length > 0
                        ? selectedAgent.includedCustomObjects.join(', ')
                        : 'None'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

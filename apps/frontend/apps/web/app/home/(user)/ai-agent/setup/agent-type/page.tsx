'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { ShoppingBag, Sparkles, ArrowRight, Check } from 'lucide-react';

export default function AgentTypePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subAccountId = searchParams.get('subAccountId');

  const [selectedType, setSelectedType] = useState<'marketplace' | 'custom' | null>(null);

  if (!subAccountId) {
    return (
      <div className="container max-w-4xl py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-500">Error: Sub-account ID is required</p>
            <Button onClick={() => router.push('/home/ai-agent/setup')} className="mt-4">
              Back to Business Details
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleContinue = () => {
    if (!selectedType) return;

    if (selectedType === 'marketplace') {
      router.push(`/home/ai-agent/setup/marketplace?subAccountId=${subAccountId}`);
    } else {
      router.push(`/home/ai-agent/setup/voice?subAccountId=${subAccountId}`);
    }
  };

  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Choose Agent Type</h1>
        <p className="text-muted-foreground mt-2">
          Select how you'd like to create your AI voice agent
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Marketplace Option */}
        <Card
          className={`cursor-pointer transition-all ${
            selectedType === 'marketplace'
              ? 'ring-2 ring-primary border-primary'
              : 'hover:border-primary/50'
          }`}
          onClick={() => setSelectedType('marketplace')}
        >
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="rounded-full bg-primary/10 p-3 mb-4">
                <ShoppingBag className="h-6 w-6 text-primary" />
              </div>
              {selectedType === 'marketplace' && (
                <div className="rounded-full bg-primary text-white p-1">
                  <Check className="h-4 w-4" />
                </div>
              )}
            </div>
            <CardTitle>Marketplace Agent</CardTitle>
            <CardDescription>
              Install a pre-built agent and customize it to your needs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-sm">Pre-configured workflows and actions</p>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-sm">Industry-specific templates</p>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-sm">Fully customizable after installation</p>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-sm">Quick setup (5-10 minutes)</p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t">
              <p className="text-sm font-medium mb-2">Best for:</p>
              <p className="text-sm text-muted-foreground">
                Businesses wanting to get started quickly with proven templates
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Custom Option */}
        <Card
          className={`cursor-pointer transition-all ${
            selectedType === 'custom'
              ? 'ring-2 ring-primary border-primary'
              : 'hover:border-primary/50'
          }`}
          onClick={() => setSelectedType('custom')}
        >
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="rounded-full bg-purple-100 p-3 mb-4">
                <Sparkles className="h-6 w-6 text-purple-600" />
              </div>
              {selectedType === 'custom' && (
                <div className="rounded-full bg-primary text-white p-1">
                  <Check className="h-4 w-4" />
                </div>
              )}
            </div>
            <CardTitle>Custom Agent</CardTitle>
            <CardDescription>
              Build your agent from scratch with complete control
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Check className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                <p className="text-sm">Choose your own voice</p>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                <p className="text-sm">Write custom prompts and personality</p>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                <p className="text-sm">Design your own workflows</p>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                <p className="text-sm">Full flexibility and customization</p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t">
              <p className="text-sm font-medium mb-2">Best for:</p>
              <p className="text-sm text-muted-foreground">
                Businesses with unique needs or specific workflows to implement
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push('/home/ai-agent/setup')}>
          Back
        </Button>

        <Button onClick={handleContinue} disabled={!selectedType}>
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

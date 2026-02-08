'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { RadioGroup, RadioGroupItem } from '@kit/ui/radio-group';
import { Label } from '@kit/ui/label';
import { useVoices, Voice } from '@kit/shared/ghl/hooks/use-voice-agent';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function VoiceSelectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subAccountId = searchParams.get('subAccountId');

  const { data: voices, isLoading, error } = useVoices();
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);

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
    if (!selectedVoice) {
      toast.error('Please select a voice');
      return;
    }

    // Store selected voice in session/state and proceed to phone selection
    sessionStorage.setItem('selectedVoice', JSON.stringify(selectedVoice));
    router.push(`/home/ai-agent/setup/phone?subAccountId=${subAccountId}`);
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Select Voice</h1>
        <p className="text-muted-foreground mt-2">
          Choose the voice personality for your AI agent
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 2: Voice Selection</CardTitle>
          <CardDescription>
            Select a voice that best represents your business
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2">Loading voices...</span>
            </div>
          )}

          {error && (
            <div className="text-red-500 py-4">
              Error loading voices. Please try again.
            </div>
          )}

          {voices && voices.length > 0 && (
            <div className="space-y-4">
              {/* Filter Options */}
              <div className="flex gap-4 mb-6">
                <Button variant="outline" size="sm">All</Button>
                <Button variant="ghost" size="sm">Male</Button>
                <Button variant="ghost" size="sm">Female</Button>
              </div>

              {/* Voice Cards */}
              <RadioGroup
                value={selectedVoice?.id}
                onValueChange={(value) => {
                  const voice = voices.find((v) => v.id === value);
                  setSelectedVoice(voice || null);
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {voices.map((voice) => (
                  <Card
                    key={voice.id}
                    className={`cursor-pointer transition-colors ${
                      selectedVoice?.id === voice.id
                        ? 'border-primary border-2'
                        : 'hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedVoice(voice)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value={voice.id} id={voice.id} />
                            <Label htmlFor={voice.id} className="font-semibold cursor-pointer">
                              {voice.name}
                            </Label>
                          </div>
                          <div className="ml-6 mt-2 space-y-1">
                            <p className="text-sm text-muted-foreground">
                              {voice.gender === 'male' ? '🧑' : '👩'} {voice.gender} • {voice.accent || voice.language}
                            </p>
                            <p className="text-sm">{voice.description}</p>
                          </div>
                        </div>
                      </div>
                      {/* Audio Preview (placeholder) */}
                      {voice.previewUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 ml-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast.info('Audio preview coming soon');
                          }}
                        >
                          🔊 Preview
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-6 mt-6 border-t">
            <Button
              variant="outline"
              onClick={() => router.push('/home/ai-agent/setup')}
            >
              Back
            </Button>
            <Button
              onClick={handleContinue}
              disabled={!selectedVoice}
            >
              Continue to Phone Number
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}



'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { RadioGroup, RadioGroupItem } from '@kit/ui/radio-group';
import { Label } from '@kit/ui/label';
import { Play, Pause } from 'lucide-react';
import { toast } from '@kit/ui/sonner';

// Cartesia Sonic 3 voices — ultra-low latency (~40ms), multilingual (42 languages).
// Voice is automatically localized to the caller's language by Cartesia.
const AVAILABLE_VOICES = [
  {
    id: 'katie-cartesia',
    name: 'Katie',
    subtitle: 'Friendly Fixer',
    provider: 'cartesia' as const,
    voiceId: 'f786b574-daa5-4673-aa0c-cbe3e8534c02',
    gender: 'female',
    accent: 'Multilingual',
    description: 'Enunciating and professional, ideal for a receptionist',
    previewUrl: '/audio/voices/katie-friendly-fixer.mp3',
  },
  {
    id: 'jacqueline-cartesia',
    name: 'Jacqueline',
    subtitle: 'Reassuring Agent',
    provider: 'cartesia' as const,
    voiceId: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
    gender: 'female',
    accent: 'Multilingual',
    description: 'Confident and empathic, great for patient support',
    previewUrl: '/audio/voices/jacqueline-reassuring-agent.mp3',
  },
  {
    id: 'ariana-cartesia',
    name: 'Ariana',
    subtitle: 'Kind Friend',
    provider: 'cartesia' as const,
    voiceId: 'ec1e269e-9ca0-402f-8a18-58e0e022355a',
    gender: 'female',
    accent: 'Multilingual',
    description: 'Friendly and approachable with a warm, welcoming tone',
    previewUrl: '/audio/voices/ariana-kind-friend.mp3',
  },
  {
    id: 'kira-cartesia',
    name: 'Kira',
    subtitle: 'Trusted Confidant',
    provider: 'cartesia' as const,
    voiceId: '57dcab65-68ac-45a6-8480-6c4c52ec1cd1',
    gender: 'female',
    accent: 'Multilingual',
    description: 'Emotive and empathetic, builds trust with callers',
    previewUrl: '/audio/voices/kira-trusted-confidant.mp3',
  },
  {
    id: 'connie-cartesia',
    name: 'Connie',
    subtitle: 'Candid Conversationalist',
    provider: 'cartesia' as const,
    voiceId: '8d8ce8c9-44a4-46c4-b10f-9a927b99a853',
    gender: 'female',
    accent: 'Multilingual',
    description: 'Natural and cheery, authentic conversational style',
    previewUrl: '/audio/voices/connie-candid-conversationalist.mp3',
  },
  {
    id: 'blake-cartesia',
    name: 'Blake',
    subtitle: 'Helpful Agent',
    provider: 'cartesia' as const,
    voiceId: 'a167e0f3-df7e-4d52-a9c3-f949145efdab',
    gender: 'male',
    accent: 'Multilingual',
    description: 'Energetic and engaging, great for customer support',
    previewUrl: '/audio/voices/blake-helpful-agent.mp3',
  },
  {
    id: 'kiefer-cartesia',
    name: 'Kiefer',
    subtitle: 'Assured Tone',
    provider: 'cartesia' as const,
    voiceId: '228fca29-3a0a-435c-8728-5cb483251068',
    gender: 'male',
    accent: 'Multilingual',
    description: 'Confident with strong clarity, composed and professional',
    previewUrl: '/audio/voices/kiefer-agent.mp3',
  },
  {
    id: 'kyle-cartesia',
    name: 'Kyle',
    subtitle: 'Approachable Friend',
    provider: 'cartesia' as const,
    voiceId: 'c961b81c-a935-4c17-bfb3-ba2239de8c2f',
    gender: 'male',
    accent: 'Multilingual',
    description: 'Warm and conversational, instantly friendly',
    previewUrl: '/audio/voices/kyle-approachable-friend.mp3',
  },
];

type VoiceFilter = 'all' | 'male' | 'female';

interface VoiceSelectionFormProps {
  accountId: string;
  businessName: string;
  initialVoice?: any;
  onVoiceSelect?: (voice: typeof AVAILABLE_VOICES[0] | null) => void;
}

export function VoiceSelectionForm({ accountId, businessName, initialVoice, onVoiceSelect }: VoiceSelectionFormProps) {
  const { t } = useTranslation();
  const [selectedVoice, setSelectedVoice] = useState<typeof AVAILABLE_VOICES[0] | null>(null);
  const [filter, setFilter] = useState<VoiceFilter>('all');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Load initial voice from saved progress
  useEffect(() => {
    if (initialVoice?.voiceId) {
      const voice = AVAILABLE_VOICES.find(v => v.voiceId === initialVoice.voiceId);
      if (voice) {
        setSelectedVoice(voice);
      }
    }
  }, [initialVoice]);

  // Create audio element for playing local preview files
  useEffect(() => {
    const audio = new Audio();
    let isCleaningUp = false;
    
    audio.onended = () => setPlayingVoice(null);
    audio.onerror = () => {
      if (!isCleaningUp && audio.src) {
        toast.error(t('common:setup.voice.previewLoadError'));
        setPlayingVoice(null);
      }
    };
    setAudioElement(audio);

    return () => {
      isCleaningUp = true;
      audio.pause();
      audio.src = '';
    };
  }, []);

  const filteredVoices = AVAILABLE_VOICES.filter(voice => {
    if (filter === 'all') return true;
    return voice.gender === filter;
  });

  const handleVoiceSelect = (voice: typeof AVAILABLE_VOICES[0] | null) => {
    setSelectedVoice(voice);
    onVoiceSelect?.(voice);
  };

  const handlePlayPreview = async (voiceId: string) => {
    const voice = AVAILABLE_VOICES.find(v => v.id === voiceId);
    if (!voice) return;

    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    
    if (playingVoice === voiceId) {
      setPlayingVoice(null);
      return;
    }

    setPlayingVoice(voiceId);

    try {
      if (audioElement && voice.previewUrl) {
        audioElement.src = voice.previewUrl;
        await audioElement.play();
      } else {
        throw new Error('Audio preview not available');
      }
    } catch (error) {
      console.error('Voice preview error:', error);
      toast.error(t('common:setup.voice.previewError', { name: voice.name }));
      setPlayingVoice(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Multilingual info */}
      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {t('common:setup.voice.languageBanner')}
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2">
        <Button 
          variant={filter === 'all' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setFilter('all')}
        >
          {t('common:setup.voice.filterAll')}
        </Button>
        <Button 
          variant={filter === 'female' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setFilter('female')}
        >
          {t('common:setup.voice.filterFemale')}
        </Button>
        <Button 
          variant={filter === 'male' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setFilter('male')}
        >
          {t('common:setup.voice.filterMale')}
        </Button>
      </div>

      {/* Voice Cards */}
      <RadioGroup
        value={selectedVoice?.id}
        onValueChange={(value) => {
          const voice = AVAILABLE_VOICES.find((v) => v.id === value);
          handleVoiceSelect(voice || null);
        }}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        {filteredVoices.map((voice) => (
          <Card
            key={voice.id}
            className={`cursor-pointer transition-all ${
              selectedVoice?.id === voice.id
                ? 'border-primary border-2 shadow-md'
                : 'hover:border-muted-foreground/50'
            }`}
            onClick={() => handleVoiceSelect(voice)}
          >
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value={voice.id} id={voice.id} />
                      <div>
                        <Label htmlFor={voice.id} className="font-semibold text-base cursor-pointer">
                          {voice.name}
                        </Label>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground italic">
                            {voice.subtitle}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {'\u00B7'} {voice.gender === 'male' ? t('common:setup.voice.genderMale') : t('common:setup.voice.genderFemale')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 ml-7">
                      {voice.description}
                    </p>
                  </div>
                </div>
                
                {/* Preview Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 ml-7 h-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayPreview(voice.id);
                  }}
                >
                  {playingVoice === voice.id ? (
                    <>
                      <Pause className="h-3 w-3 mr-1.5" />
                      {t('common:setup.voice.stop')}
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1.5" />
                      {t('common:setup.voice.preview')}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
        ))}
      </RadioGroup>

      {filteredVoices.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          {t('common:setup.voice.noVoicesFound')}
        </div>
      )}
    </div>
  );
}

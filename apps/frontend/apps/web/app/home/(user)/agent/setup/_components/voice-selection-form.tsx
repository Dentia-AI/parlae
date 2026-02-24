'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { RadioGroup, RadioGroupItem } from '@kit/ui/radio-group';
import { Label } from '@kit/ui/label';
import { Play, Pause } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import {
  getVoicesForProvider,
  type VoiceDefinition,
} from '@kit/shared/voice-provider/voices';

type VoiceFilter = 'all' | 'male' | 'female';

interface VoiceSelectionFormProps {
  accountId: string;
  businessName: string;
  initialVoice?: any;
  voiceProvider?: 'VAPI' | 'RETELL';
  onVoiceSelect?: (voice: VoiceDefinition | null) => void;
}

export function VoiceSelectionForm({ accountId, businessName, initialVoice, voiceProvider = 'VAPI', onVoiceSelect }: VoiceSelectionFormProps) {
  const { t } = useTranslation();
  const availableVoices = useMemo(() => getVoicesForProvider(voiceProvider), [voiceProvider]);
  const [selectedVoice, setSelectedVoice] = useState<VoiceDefinition | null>(null);
  const [filter, setFilter] = useState<VoiceFilter>('all');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Load initial voice from saved progress (search across both provider lists)
  useEffect(() => {
    if (initialVoice?.voiceId) {
      const voice = availableVoices.find(v => v.voiceId === initialVoice.voiceId);
      if (voice) {
        setSelectedVoice(voice);
      }
    }
  }, [initialVoice, availableVoices]);

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

  const filteredVoices = availableVoices.filter(voice => {
    if (filter === 'all') return true;
    return voice.gender === filter;
  });

  const handleVoiceSelect = (voice: VoiceDefinition | null) => {
    setSelectedVoice(voice);
    onVoiceSelect?.(voice);
  };

  const handlePlayPreview = async (voiceId: string) => {
    const voice = availableVoices.find(v => v.id === voiceId);
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
      <div className="rounded-xl bg-muted/80 px-4 py-3 text-sm text-muted-foreground">
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
          const voice = availableVoices.find((v) => v.id === value);
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

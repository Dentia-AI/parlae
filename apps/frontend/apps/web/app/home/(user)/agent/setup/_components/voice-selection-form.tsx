'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { RadioGroup, RadioGroupItem } from '@kit/ui/radio-group';
import { Label } from '@kit/ui/label';
import { Play, Pause } from 'lucide-react';
import { toast } from '@kit/ui/sonner';

// Vapi voice providers and their voices
// Note: 11Labs voices need the full voice ID from their API
const AVAILABLE_VOICES = [
  {
    id: 'rachel-11labs',
    name: 'Rachel',
    provider: '11labs' as const,
    voiceId: '21m00Tcm4TlvDq8ikWAM', // 11Labs Rachel voice ID
    gender: 'female',
    accent: 'American',
    description: 'Warm and professional voice, perfect for healthcare',
    previewUrl: '/audio/voices/rachel-11labs.mp3', // Static preview file
  },
  {
    id: 'josh-11labs',
    name: 'Josh',
    provider: '11labs' as const,
    voiceId: 'TxGEqnHWrfWFTfGW9XjX', // 11Labs Josh voice ID
    gender: 'male',
    accent: 'American',
    description: 'Friendly and approachable, great for customer service',
    previewUrl: '/audio/voices/josh-11labs.mp3', // Static preview file
  },
  {
    id: 'bella-11labs',
    name: 'Bella',
    provider: '11labs' as const,
    voiceId: 'EXAVITQu4vr4xnSDxMaL', // 11Labs Bella voice ID
    gender: 'female',
    accent: 'American',
    description: 'Clear and articulate, excellent for appointments',
    previewUrl: '/audio/voices/bella-11labs.mp3', // Static preview file
  },
  {
    id: 'antoni-11labs',
    name: 'Antoni',
    provider: '11labs' as const,
    voiceId: 'ErXwobaYiN019PkySvjV', // 11Labs Antoni voice ID
    gender: 'male',
    accent: 'American',
    description: 'Professional and reassuring tone',
    previewUrl: '/audio/voices/antoni-11labs.mp3', // Static preview file
  },
  {
    id: 'alloy-openai',
    name: 'Alloy',
    provider: 'openai' as const,
    voiceId: 'alloy',
    gender: 'neutral',
    accent: 'Neutral',
    description: 'Balanced and neutral voice',
    previewUrl: '/audio/voices/alloy-openai.mp3', // Static preview file
  },
  {
    id: 'echo-openai',
    name: 'Echo',
    provider: 'openai' as const,
    voiceId: 'echo',
    gender: 'male',
    accent: 'American',
    description: 'Clear and confident',
    previewUrl: '/audio/voices/echo-openai.mp3', // Static preview file
  },
  {
    id: 'nova-openai',
    name: 'Nova',
    provider: 'openai' as const,
    voiceId: 'nova',
    gender: 'female',
    accent: 'American',
    description: 'Energetic and friendly',
    previewUrl: '/audio/voices/nova-openai.mp3', // Static preview file
  },
];

type VoiceFilter = 'all' | 'male' | 'female' | 'neutral';

interface VoiceSelectionFormProps {
  accountId: string;
  businessName: string;
  initialVoice?: any; // Pre-selected voice from saved progress
  onVoiceSelect?: (voice: typeof AVAILABLE_VOICES[0] | null) => void;
}

export function VoiceSelectionForm({ accountId, businessName, initialVoice, onVoiceSelect }: VoiceSelectionFormProps) {
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

  // Load available voices for Speech Synthesis API (for OpenAI preview)
  useEffect(() => {
    if ('speechSynthesis' in window) {
      // Load voices
      speechSynthesis.getVoices();
      
      // Some browsers need this event
      speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.getVoices();
      };
    }

    // Create audio element for playing previews
    const audio = new Audio();
    let isCleaningUp = false;
    
    audio.onended = () => setPlayingVoice(null);
    audio.onerror = (error) => {
      // Only show error if we're not cleaning up and actually trying to play
      if (!isCleaningUp && audio.src) {
        console.error('Audio error:', error);
        toast.error('Failed to play voice preview');
        setPlayingVoice(null);
      }
    };
    setAudioElement(audio);

    return () => {
      isCleaningUp = true;
      audio.pause();
      audio.src = '';
    };
  }, []); // Remove playingVoice dependency to prevent race condition

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

    // Stop any currently playing audio
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    
    // If clicking the same voice, stop it
    if (playingVoice === voiceId) {
      setPlayingVoice(null);
      return;
    }

    setPlayingVoice(voiceId);

    try {
      // Play static audio file
      if (audioElement && voice.previewUrl) {
        audioElement.src = voice.previewUrl;
        await audioElement.play();
        toast.success(`Playing ${voice.name}`);
      } else {
        throw new Error('Audio preview not available');
      }
    } catch (error) {
      console.error('Voice preview error:', error);
      toast.error(`Failed to play ${voice.name}. Audio file may not be generated yet.`);
      setPlayingVoice(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Buttons */}
      <div className="flex gap-2">
        <Button 
          variant={filter === 'all' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setFilter('all')}
        >
          All Voices
        </Button>
        <Button 
          variant={filter === 'female' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setFilter('female')}
        >
          Female
        </Button>
        <Button 
          variant={filter === 'male' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setFilter('male')}
        >
          Male
        </Button>
        <Button 
          variant={filter === 'neutral' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setFilter('neutral')}
        >
          Neutral
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
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {voice.provider}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {voice.gender === 'male' ? '🧑' : voice.gender === 'female' ? '👩' : '🤖'} {voice.gender}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            • {voice.accent}
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
                      Stop
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1.5" />
                      Preview
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
        ))}
      </RadioGroup>

      {filteredVoices.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No voices found for this filter
        </div>
      )}
    </div>
  );
}

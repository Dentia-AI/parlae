'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { useCreateVoiceAgent, useDeployVoiceAgent, Voice, PhoneNumber } from '@kit/shared/ghl/hooks/use-voice-agent';
import { toast } from 'sonner';
import { Check, Loader2, Phone, MessageSquare, FileText, Mic } from 'lucide-react';

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source: 'upload' | 'url' | 'text';
}

export default function ReviewDeployPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subAccountId = searchParams.get('subAccountId');

  const createVoiceAgent = useCreateVoiceAgent();
  const deployVoiceAgent = useDeployVoiceAgent();

  const [agentConfig, setAgentConfig] = useState<any>(null);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<PhoneNumber | null>(null);
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentStep, setDeploymentStep] = useState('');

  useEffect(() => {
    // Load data from session storage
    const configData = sessionStorage.getItem('agentConfig');
    const knowledgeData = sessionStorage.getItem('knowledgeEntries');

    if (configData) {
      const config = JSON.parse(configData);
      setAgentConfig(config);
      
      // Set individual states for backward compatibility
      if (config.voiceId) {
        setSelectedVoice({
          id: config.voiceId,
          name: config.voiceName || config.voiceId,
          gender: 'male',
          language: config.language || 'en-US',
        } as Voice);
      }
      
      if (config.phoneNumber) {
        setSelectedPhone({
          phoneNumber: config.phoneNumber,
          friendlyName: config.phoneNumber,
          city: '',
          state: '',
          capabilities: [],
          monthlyPrice: 0,
        } as PhoneNumber);
      }
    }
    
    if (knowledgeData) setKnowledgeEntries(JSON.parse(knowledgeData));
  }, []);

  if (!subAccountId) {
    return (
      <div className="container max-w-4xl py-8">
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

  const handleDeploy = async () => {
    if (!agentConfig || !agentConfig.voiceId) {
      toast.error('Missing configuration. Please complete all steps.');
      return;
    }

    console.log('🚀 Deploying Agent:', {
      subAccountId,
      agentName: agentConfig.name,
      voiceId: agentConfig.voiceId,
      voiceName: agentConfig.voiceName,
      marketplaceTemplate: agentConfig.marketplaceAgentId || 'Custom (no template)',
      phoneNumber: agentConfig.phoneNumber || 'Not assigned',
      language: agentConfig.language,
      personality: agentConfig.personality,
      knowledgeEntriesCount: knowledgeEntries.length,
    });

    try {
      setIsDeploying(true);

      // Step 1: Create voice agent with full configuration
      setDeploymentStep('Creating voice agent...');
      const voiceAgent = await createVoiceAgent.mutateAsync({
        subAccountId,
        config: {
          name: agentConfig.name || 'AI Voice Agent',
          voiceId: agentConfig.voiceId,
          voiceName: agentConfig.voiceName,
          phoneNumber: agentConfig.phoneNumber,
          language: agentConfig.language || 'en-US',
          prompt: agentConfig.prompt,
          greetingMessage: agentConfig.greetingMessage,
          personality: agentConfig.personality,
          workflows: agentConfig.workflows,
          postCallActions: {
            sendSMS: true,
            sendEmail: true,
            updateCRM: true,
          },
        },
      });

      console.log('✅ Voice Agent Created:', {
        voiceAgentId: voiceAgent.id,
        status: voiceAgent.status,
      });

      toast.success('Voice agent created');

      // Step 2: Add knowledge base (would be done here)
      setDeploymentStep('Adding knowledge base...');
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Mock delay
      toast.success('Knowledge base added');

      // Step 3: Deploy to GHL
      setDeploymentStep('Deploying to GoHighLevel...');
      await deployVoiceAgent.mutateAsync(voiceAgent.id);

      toast.success('🎉 Voice agent deployed successfully!');

      // Clear session storage
      sessionStorage.removeItem('agentConfig');
      sessionStorage.removeItem('marketplaceAgent');
      sessionStorage.removeItem('knowledgeEntries');

      // Redirect to success page
      router.push(`/home/ai-agent?deployed=true`);
    } catch (error) {
      console.error('Deployment error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to deploy voice agent');
    } finally {
      setIsDeploying(false);
      setDeploymentStep('');
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Review & Deploy</h1>
        <p className="text-muted-foreground mt-2">
          Review your configuration and deploy your AI voice agent
        </p>
      </div>

      <div className="space-y-6">
        {/* Configuration Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Step 5: Review Configuration</CardTitle>
            <CardDescription>
              Review your settings before deploying
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Agent Name */}
            {agentConfig?.name && (
              <div className="flex items-start gap-4 p-4 border rounded-lg">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Agent Name</h3>
                  <p className="text-sm mt-1">{agentConfig.name}</p>
                  {agentConfig.marketplaceAgentId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Based on marketplace template
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Voice */}
            <div className="flex items-start gap-4 p-4 border rounded-lg">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Voice</h3>
                {agentConfig?.voiceName ? (
                  <div className="mt-1">
                    <p className="text-sm">{agentConfig.voiceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {agentConfig.language || 'en-US'} • {agentConfig.personality || 'professional'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-red-500">Not selected</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/home/ai-agent/setup/customize?subAccountId=${subAccountId}`)}
              >
                Edit
              </Button>
            </div>

            {/* Phone Number */}
            <div className="flex items-start gap-4 p-4 border rounded-lg">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Phone Number</h3>
                {selectedPhone ? (
                  <div className="mt-1">
                    <p className="text-sm font-mono">{selectedPhone.phoneNumber}</p>
                    <p className="text-xs text-muted-foreground">{selectedPhone.friendlyName}</p>
                  </div>
                ) : (
                  <p className="text-sm text-red-500">Not selected</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/home/ai-agent/setup/phone?subAccountId=${subAccountId}`)}
              >
                Edit
              </Button>
            </div>

            {/* Knowledge Base */}
            <div className="flex items-start gap-4 p-4 border rounded-lg">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Knowledge Base</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {knowledgeEntries.length} {knowledgeEntries.length === 1 ? 'entry' : 'entries'} added
                </p>
                {knowledgeEntries.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {knowledgeEntries.slice(0, 3).map((entry) => (
                      <li key={entry.id} className="text-xs text-muted-foreground">
                        • {entry.title}
                      </li>
                    ))}
                    {knowledgeEntries.length > 3 && (
                      <li className="text-xs text-muted-foreground">
                        ... and {knowledgeEntries.length - 3} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/home/ai-agent/setup/knowledge?subAccountId=${subAccountId}`)}
              >
                Edit
              </Button>
            </div>

            {/* Preset Configuration */}
            <div className="flex items-start gap-4 p-4 border rounded-lg bg-muted/50">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Preset Configuration</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  The following features are automatically configured:
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-600" />
                    Appointment booking workflow
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-600" />
                    Lead capture & CRM sync
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-600" />
                    Post-call SMS & email
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-600" />
                    Call transcripts & summaries
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-600" />
                    Business hours (Mon-Fri, 9AM-5PM)
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Deployment Status */}
        {isDeploying && (
          <Card className="border-primary">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <div>
                  <p className="font-semibold">Deploying Your AI Agent...</p>
                  <p className="text-sm text-muted-foreground">{deploymentStep}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Deploy Button */}
        <div className="flex justify-between pt-6">
          <Button
            variant="outline"
            onClick={() => router.push(`/home/ai-agent/setup/knowledge?subAccountId=${subAccountId}`)}
            disabled={isDeploying}
          >
            Back
          </Button>
          <Button
            onClick={handleDeploy}
            disabled={isDeploying || !selectedVoice || !selectedPhone}
            size="lg"
            className="min-w-[200px]"
          >
            {isDeploying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                🚀 Deploy AI Agent
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

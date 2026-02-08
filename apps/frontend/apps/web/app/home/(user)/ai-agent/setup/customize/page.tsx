'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { Label } from '@kit/ui/label';
import { Input } from '@kit/ui/input';
import { Textarea } from '@kit/ui/textarea';
import { Switch } from '@kit/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Separator } from '@kit/ui/separator';
import { Badge } from '@kit/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Trash2, Settings, MessageSquare, Zap, Phone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  voiceId?: string;
  features: string[];
  includesWorkflows: boolean;
  includesActions: boolean;
}

interface Voice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  language: string;
  accent?: string;
  description?: string;
}

interface PhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  city: string;
  state: string;
  capabilities: string[];
  monthlyPrice: number;
}

interface WorkflowConfig {
  appointmentBooking: boolean;
  leadCapture: boolean;
  informationRetrieval: boolean;
  callTransfer: boolean;
  voicemail: boolean;
}

interface CustomAction {
  id: string;
  name: string;
  type: string;
  description: string;
  config: Record<string, any>;
}

export default function CustomizePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subAccountId = searchParams.get('subAccountId');
  const agentType = searchParams.get('type'); // 'marketplace' or 'custom'

  const queryClient = useQueryClient();

  // State
  const [marketplaceAgent, setMarketplaceAgent] = useState<MarketplaceAgent | null>(null);
  const [agentName, setAgentName] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<PhoneNumber | null>(null);
  const [prompt, setPrompt] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [personality, setPersonality] = useState('professional');
  const [language, setLanguage] = useState('en-US');
  const [workflows, setWorkflows] = useState<WorkflowConfig>({
    appointmentBooking: true,
    leadCapture: true,
    informationRetrieval: true,
    callTransfer: false,
    voicemail: true,
  });
  const [customActions, setCustomActions] = useState<CustomAction[]>([]);

  // Fetch voices
  const { data: voicesData } = useQuery({
    queryKey: ['voices'],
    queryFn: async () => {
      const response = await fetch('/api/ghl/voices', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch voices');
      return response.json();
    },
  });

  // Fetch phone numbers
  const { data: phonesData } = useQuery({
    queryKey: ['phone-numbers'],
    queryFn: async () => {
      const response = await fetch('/api/ghl/phone/available', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch phone numbers');
      return response.json();
    },
  });

  // Extract data from queries
  const voices = voicesData?.voices || [];
  const phoneNumbers = phonesData?.phoneNumbers || [];

  // Load marketplace agent if applicable and set defaults
  useEffect(() => {
    if (agentType === 'marketplace') {
      const stored = sessionStorage.getItem('marketplaceAgent');
      if (stored) {
        const agent = JSON.parse(stored) as MarketplaceAgent;
        setMarketplaceAgent(agent);
        setAgentName(agent.name);
        
        // Set default prompt based on marketplace agent
        setPrompt(`You are a ${agent.name} assistant. ${agent.description}

Your key capabilities include:
${agent.features.map((f) => `- ${f}`).join('\n')}

Always be professional, friendly, and helpful.`);
        
        setGreetingMessage(`Thank you for calling! I'm your ${agent.name}. How can I assist you today?`);
        
        // Set default workflows based on marketplace agent
        if (agent.includesWorkflows) {
          setWorkflows({
            appointmentBooking: true,
            leadCapture: true,
            informationRetrieval: true,
            callTransfer: true,
            voicemail: true,
          });
        }
      }
    } else {
      setAgentName('My AI Voice Agent');
      setPrompt(`You are a professional and friendly AI assistant.

Your responsibilities:
- Answer customer questions professionally and accurately
- Help with scheduling and appointments
- Capture lead information
- Provide helpful information
- Transfer calls when necessary

Always be polite, clear, and solution-oriented.`);
      setGreetingMessage('Thank you for calling! How can I help you today?');
    }
  }, [agentType]);

  // Set default voice from marketplace agent when voices are loaded
  useEffect(() => {
    if (marketplaceAgent?.voiceId && voices.length > 0 && !selectedVoice) {
      const defaultVoice = voices.find((v: Voice) => v.id === marketplaceAgent.voiceId);
      if (defaultVoice) {
        setSelectedVoice(defaultVoice);
      }
    }
  }, [marketplaceAgent, voices, selectedVoice]);

  const handleSaveAndContinue = async () => {
    if (!agentName.trim()) {
      toast.error('Please provide an agent name');
      return;
    }

    if (!selectedVoice) {
      toast.error('Please select a voice');
      return;
    }

    // Store configuration in session storage
    const config = {
      name: agentName,
      voiceId: selectedVoice.id,
      voiceName: selectedVoice.name,
      phoneNumber: selectedPhone?.phoneNumber,
      language,
      prompt,
      greetingMessage,
      personality,
      workflows,
      customActions,
      marketplaceAgentId: marketplaceAgent?.id,
    };

    console.log('🔧 Agent Configuration Saved:', {
      marketplaceAgentId: config.marketplaceAgentId || 'Custom Agent (no template)',
      voiceId: config.voiceId,
      voiceName: config.voiceName,
      phoneNumber: config.phoneNumber || 'Not assigned',
      workflowsEnabled: Object.entries(config.workflows).filter(([_, enabled]) => enabled).map(([name]) => name),
      customActionsCount: config.customActions.length,
    });

    sessionStorage.setItem('agentConfig', JSON.stringify(config));
    toast.success('Configuration saved!');
    
    // Proceed to knowledge base
    router.push(`/home/ai-agent/setup/knowledge?subAccountId=${subAccountId}`);
  };

  const addCustomAction = () => {
    const newAction: CustomAction = {
      id: `action-${Date.now()}`,
      name: 'New Action',
      type: 'webhook',
      description: '',
      config: {},
    };
    setCustomActions([...customActions, newAction]);
  };

  const removeCustomAction = (id: string) => {
    setCustomActions(customActions.filter((a) => a.id !== id));
  };

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Customize Your AI Agent</h1>
        <p className="text-muted-foreground mt-2">
          {agentType === 'marketplace'
            ? `Customize "${marketplaceAgent?.name || 'your agent'}" to fit your business needs`
            : 'Configure your custom AI voice agent from scratch'}
        </p>
      </div>

      {marketplaceAgent && (
        <Card className="mb-6 border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Based on: {marketplaceAgent.name}</CardTitle>
            <CardDescription>
              This agent includes pre-configured workflows and actions that you can customize below
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Tabs defaultValue="basic" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">
            <Settings className="h-4 w-4 mr-2" />
            Basic
          </TabsTrigger>
          <TabsTrigger value="prompt">
            <MessageSquare className="h-4 w-4 mr-2" />
            Prompt
          </TabsTrigger>
          <TabsTrigger value="workflows">
            <Zap className="h-4 w-4 mr-2" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="phone">
            <Phone className="h-4 w-4 mr-2" />
            Phone
          </TabsTrigger>
        </TabsList>

        {/* Basic Configuration */}
        <TabsContent value="basic" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Configure the essential settings for your agent</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Agent Name */}
              <div className="space-y-2">
                <Label htmlFor="agentName">Agent Name *</Label>
                <Input
                  id="agentName"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g., Appointment Booking Assistant"
                />
                <p className="text-xs text-muted-foreground">
                  This is the internal name for your agent
                </p>
              </div>

              <Separator />

              {/* Voice Selection */}
              <div className="space-y-2">
                <Label>Select Voice *</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {voices.map((voice: Voice) => (
                    <Card
                      key={voice.id}
                      className={`cursor-pointer transition-all ${
                        selectedVoice?.id === voice.id
                          ? 'ring-2 ring-primary border-primary'
                          : 'hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedVoice(voice)}
                    >
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm">{voice.name}</CardTitle>
                        <CardDescription className="text-xs">
                          <Badge variant="secondary" className="text-xs mr-1">
                            {voice.gender}
                          </Badge>
                          {voice.accent}
                        </CardDescription>
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {voice.description}
                        </p>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Language */}
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="en-GB">English (UK)</SelectItem>
                    <SelectItem value="es-ES">Spanish</SelectItem>
                    <SelectItem value="fr-FR">French</SelectItem>
                    <SelectItem value="de-DE">German</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Personality */}
              <div className="space-y-2">
                <Label htmlFor="personality">Personality</Label>
                <Select value={personality} onValueChange={setPersonality}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly & Casual</SelectItem>
                    <SelectItem value="empathetic">Empathetic & Warm</SelectItem>
                    <SelectItem value="authoritative">Authoritative</SelectItem>
                    <SelectItem value="cheerful">Cheerful & Energetic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Prompt Configuration */}
        <TabsContent value="prompt" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>
                Define how your agent should behave and respond to customers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="prompt">Agent Instructions *</Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={12}
                  placeholder="Enter detailed instructions for your agent..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{'}businessName{'}'} as a placeholder for your business name
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="greeting">Greeting Message *</Label>
                <Textarea
                  id="greeting"
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  rows={3}
                  placeholder="e.g., Thank you for calling! How can I help you today?"
                />
                <p className="text-xs text-muted-foreground">
                  This is the first thing your agent will say when answering a call
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflows */}
        <TabsContent value="workflows" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Workflows & Capabilities</CardTitle>
              <CardDescription>
                Enable or disable specific workflows for your agent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(workflows).map(([key, enabled]) => (
                <div key={key} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {key
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (str) => str.toUpperCase())}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {getWorkflowDescription(key)}
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(checked) =>
                      setWorkflows({ ...workflows, [key]: checked })
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Custom Actions</CardTitle>
                  <CardDescription>Add custom actions and integrations</CardDescription>
                </div>
                <Button onClick={addCustomAction} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Action
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {customActions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No custom actions added yet
                </p>
              ) : (
                <div className="space-y-3">
                  {customActions.map((action) => (
                    <div key={action.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="flex-1">
                        <Input
                          placeholder="Action name"
                          value={action.name}
                          onChange={(e) => {
                            setCustomActions(
                              customActions.map((a) =>
                                a.id === action.id ? { ...a, name: e.target.value } : a,
                              ),
                            );
                          }}
                          className="mb-2"
                        />
                        <Input
                          placeholder="Description"
                          value={action.description}
                          onChange={(e) => {
                            setCustomActions(
                              customActions.map((a) =>
                                a.id === action.id ? { ...a, description: e.target.value } : a,
                              ),
                            );
                          }}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCustomAction(action.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Phone Number */}
        <TabsContent value="phone" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Phone Number (Optional)</CardTitle>
              <CardDescription>
                Select a phone number for your agent. You can assign one later if needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-3">
                {phoneNumbers.slice(0, 6).map((phone: PhoneNumber) => (
                  <Card
                    key={phone.phoneNumber}
                    className={`cursor-pointer transition-all ${
                      selectedPhone?.phoneNumber === phone.phoneNumber
                        ? 'ring-2 ring-primary border-primary'
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedPhone(phone)}
                  >
                    <CardHeader className="p-4">
                      <CardTitle className="text-base">{phone.phoneNumber}</CardTitle>
                      <CardDescription className="text-xs">
                        {phone.city}, {phone.state}
                      </CardDescription>
                      <div className="flex gap-1 mt-2">
                        {phone.capabilities.map((cap) => (
                          <Badge key={cap} variant="secondary" className="text-xs">
                            {cap}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        ${phone.monthlyPrice}/month
                      </p>
                    </CardHeader>
                  </Card>
                ))}
              </div>
              {selectedPhone && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPhone(null)}
                  className="mt-4"
                >
                  Clear Selection
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6 border-t">
        <Button
          variant="outline"
          onClick={() => {
            if (agentType === 'marketplace') {
              router.push(`/home/ai-agent/setup/marketplace?subAccountId=${subAccountId}`);
            } else {
              router.push(`/home/ai-agent/setup/agent-type?subAccountId=${subAccountId}`);
            }
          }}
        >
          Back
        </Button>

        <Button onClick={handleSaveAndContinue} disabled={!agentName || !selectedVoice}>
          Continue to Knowledge Base
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function getWorkflowDescription(workflow: string): string {
  const descriptions: Record<string, string> = {
    appointmentBooking: 'Allow customers to schedule, reschedule, and cancel appointments',
    leadCapture: 'Collect contact information and qualify leads automatically',
    informationRetrieval: 'Answer questions using your knowledge base',
    callTransfer: 'Transfer calls to human agents when needed',
    voicemail: 'Leave voicemails when calls go unanswered',
  };
  return descriptions[workflow] || '';
}

'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';
import { Switch } from '@kit/ui/switch';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Separator } from '@kit/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { 
  Wrench, 
  AlertTriangle, 
  Loader2,
  Save,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';

export function AdvancedSetupContent() {
  const [pending, startTransition] = useTransition();

  // Assistant Configuration
  const [modelProvider, setModelProvider] = useState<'openai' | 'anthropic' | 'groq'>('openai');
  const [modelName, setModelName] = useState('gpt-4o');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(500);
  const [firstMessage, setFirstMessage] = useState('');

  // Voice Configuration
  const [voiceProvider, setVoiceProvider] = useState<'11labs' | 'openai' | 'playht'>('11labs');
  const [voiceId, setVoiceId] = useState('');
  const [voiceStability, setVoiceStability] = useState(0.5);
  const [voiceSimilarity, setVoiceSimilarity] = useState(0.75);

  // Recording & Analysis
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [endCallFunctionEnabled, setEndCallFunctionEnabled] = useState(true);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [analysisPrompt, setAnalysisPrompt] = useState('');

  // Advanced Features
  const [serverUrl, setServerUrl] = useState('');
  const [serverSecret, setServerSecret] = useState('');
  const [hipaaEnabled, setHipaaEnabled] = useState(false);
  const [backgroundSound, setBackgroundSound] = useState<'off' | 'office'>('off');

  const handleSave = () => {
    startTransition(() => {
      toast.success('Advanced configuration saved (feature in development)');
    });
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all advanced settings to defaults?')) {
      startTransition(() => {
        toast.info('Settings reset to defaults');
      });
    }
  };

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="h-8 w-8" />
            Advanced Setup
          </h1>
          <p className="text-muted-foreground mt-2">
            Fine-tune your AI agent's behavior and capabilities
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} disabled={pending}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          These are advanced settings. Changes can significantly affect your AI agent's behavior.
          Proceed with caution and test thoroughly after making changes.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="assistant" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="assistant">Assistant</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="model">Model</TabsTrigger>
          <TabsTrigger value="recording">Recording</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* Assistant Tab */}
        <TabsContent value="assistant" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assistant Behavior</CardTitle>
              <CardDescription>
                Configure how your AI assistant starts and ends conversations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstMessage">First Message</Label>
                <Textarea
                  id="firstMessage"
                  placeholder="Hello! Thank you for calling. How can I help you today?"
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  The greeting message your agent says when answering a call
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>End Call Function</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow AI to end calls when conversation concludes
                  </p>
                </div>
                <Switch
                  checked={endCallFunctionEnabled}
                  onCheckedChange={setEndCallFunctionEnabled}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Voice Tab */}
        <TabsContent value="voice" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Voice Configuration</CardTitle>
              <CardDescription>
                Fine-tune voice quality and characteristics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="voiceProvider">Voice Provider</Label>
                <select
                  id="voiceProvider"
                  className="w-full border rounded-md p-2"
                  value={voiceProvider}
                  onChange={(e) => setVoiceProvider(e.target.value as any)}
                >
                  <option value="11labs">11Labs</option>
                  <option value="openai">OpenAI</option>
                  <option value="playht">PlayHT</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="voiceId">Voice ID</Label>
                <Input
                  id="voiceId"
                  placeholder="21m00Tcm4TlvDq8ikWAM"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Provider-specific voice identifier
                </p>
              </div>

              {voiceProvider === '11labs' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="voiceStability">
                      Stability: {voiceStability.toFixed(2)}
                    </Label>
                    <input
                      type="range"
                      id="voiceStability"
                      min="0"
                      max="1"
                      step="0.05"
                      value={voiceStability}
                      onChange={(e) => setVoiceStability(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      Lower = more variable, Higher = more consistent
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="voiceSimilarity">
                      Similarity: {voiceSimilarity.toFixed(2)}
                    </Label>
                    <input
                      type="range"
                      id="voiceSimilarity"
                      min="0"
                      max="1"
                      step="0.05"
                      value={voiceSimilarity}
                      onChange={(e) => setVoiceSimilarity(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      Enhances voice clarity and similarity to original
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Model Tab */}
        <TabsContent value="model" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Language Model</CardTitle>
              <CardDescription>
                Configure the AI model and its behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="modelProvider">Model Provider</Label>
                  <select
                    id="modelProvider"
                    className="w-full border rounded-md p-2"
                    value={modelProvider}
                    onChange={(e) => setModelProvider(e.target.value as any)}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="groq">Groq</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="modelName">Model Name</Label>
                  <Input
                    id="modelName"
                    placeholder="gpt-4o"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  placeholder="You are a helpful medical receptionist..."
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={6}
                />
                <p className="text-sm text-muted-foreground">
                  Instructions that guide the AI's behavior throughout conversations
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temperature">
                    Temperature: {temperature.toFixed(2)}
                  </Label>
                  <input
                    type="range"
                    id="temperature"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-sm text-muted-foreground">
                    Lower = more focused, Higher = more creative
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxTokens">Max Tokens</Label>
                  <Input
                    type="number"
                    id="maxTokens"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  />
                  <p className="text-sm text-muted-foreground">
                    Maximum response length (tokens)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recording Tab */}
        <TabsContent value="recording" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Call Recording & Analysis</CardTitle>
              <CardDescription>
                Configure call recording and post-call analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Call Recording</Label>
                  <p className="text-sm text-muted-foreground">
                    Record all calls for quality assurance and training
                  </p>
                </div>
                <Switch
                  checked={recordingEnabled}
                  onCheckedChange={setRecordingEnabled}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Post-Call Analysis</Label>
                  <p className="text-sm text-muted-foreground">
                    Analyze calls using AI for insights and summaries
                  </p>
                </div>
                <Switch
                  checked={analysisEnabled}
                  onCheckedChange={setAnalysisEnabled}
                />
              </div>

              {analysisEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="analysisPrompt">Analysis Prompt</Label>
                  <Textarea
                    id="analysisPrompt"
                    placeholder="Summarize the call and identify: 1) Patient's concern, 2) Outcome, 3) Follow-up needed"
                    value={analysisPrompt}
                    onChange={(e) => setAnalysisPrompt(e.target.value)}
                    rows={4}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Webhook Configuration</CardTitle>
              <CardDescription>
                Connect to external services for custom functionality
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="serverUrl">Server URL</Label>
                <Input
                  id="serverUrl"
                  type="url"
                  placeholder="https://api.yourcompany.com/vapi/webhook"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Endpoint for receiving webhook events
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="serverSecret">Server Secret</Label>
                <Input
                  id="serverSecret"
                  type="password"
                  placeholder="••••••••••••"
                  value={serverSecret}
                  onChange={(e) => setServerSecret(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Secret key for webhook verification
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Features</CardTitle>
              <CardDescription>
                Additional configuration options for specialized use cases
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>HIPAA Compliance Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable enhanced privacy and security features
                  </p>
                </div>
                <Switch
                  checked={hipaaEnabled}
                  onCheckedChange={setHipaaEnabled}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="backgroundSound">Background Sound</Label>
                <select
                  id="backgroundSound"
                  className="w-full border rounded-md p-2"
                  value={backgroundSound}
                  onChange={(e) => setBackgroundSound(e.target.value as any)}
                >
                  <option value="off">None</option>
                  <option value="office">Office Ambience</option>
                </select>
                <p className="text-sm text-muted-foreground">
                  Add subtle background sound for more natural conversations
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions that affect your AI agent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Delete AI Agent</Label>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete your AI agent and all associated data
                  </p>
                </div>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

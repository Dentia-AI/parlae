'use client';

import { useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      toast.success(t('advancedPage.saved'));
    });
  };

  const handleReset = () => {
    if (confirm(t('advancedPage.resetConfirm'))) {
      startTransition(() => {
        toast.info(t('advancedPage.resetDone'));
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
            {t('advancedPage.title')}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t('advancedPage.fineTune')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} disabled={pending}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('advancedPage.reset')}
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t('advancedPage.saveChanges')}
          </Button>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {t('advancedPage.warningMessage')}
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="assistant" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="assistant">{t('advancedPage.tabs.assistant')}</TabsTrigger>
          <TabsTrigger value="voice">{t('advancedPage.tabs.voice')}</TabsTrigger>
          <TabsTrigger value="model">{t('advancedPage.tabs.model')}</TabsTrigger>
          <TabsTrigger value="recording">{t('advancedPage.tabs.recording')}</TabsTrigger>
          <TabsTrigger value="webhooks">{t('advancedPage.tabs.webhooks')}</TabsTrigger>
          <TabsTrigger value="advanced">{t('advancedPage.tabs.advanced')}</TabsTrigger>
        </TabsList>

        {/* Assistant Tab */}
        <TabsContent value="assistant" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('advancedPage.assistant.title')}</CardTitle>
              <CardDescription>
                {t('advancedPage.assistant.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstMessage">{t('advancedPage.assistant.firstMessage')}</Label>
                <Textarea
                  id="firstMessage"
                  placeholder="Hello! Thank you for calling. How can I help you today?"
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  {t('advancedPage.assistant.firstMessageHint')}
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>{t('advancedPage.assistant.endCallFunction')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('advancedPage.assistant.endCallFunctionDesc')}
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
              <CardTitle>{t('advancedPage.voice.title')}</CardTitle>
              <CardDescription>
                {t('advancedPage.voice.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="voiceProvider">{t('advancedPage.voice.provider')}</Label>
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
                <Label htmlFor="voiceId">{t('advancedPage.voice.voiceId')}</Label>
                <Input
                  id="voiceId"
                  placeholder="21m00Tcm4TlvDq8ikWAM"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  {t('advancedPage.voice.voiceIdHint')}
                </p>
              </div>

              {voiceProvider === '11labs' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="voiceStability">
                      {t('advancedPage.voice.stability')} {voiceStability.toFixed(2)}
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
                      {t('advancedPage.voice.stabilityHint')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="voiceSimilarity">
                      {t('advancedPage.voice.similarity')} {voiceSimilarity.toFixed(2)}
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
                      {t('advancedPage.voice.similarityHint')}
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
              <CardTitle>{t('advancedPage.model.title')}</CardTitle>
              <CardDescription>
                {t('advancedPage.model.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="modelProvider">{t('advancedPage.model.provider')}</Label>
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
                  <Label htmlFor="modelName">{t('advancedPage.model.modelName')}</Label>
                  <Input
                    id="modelName"
                    placeholder="gpt-4o"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="systemPrompt">{t('advancedPage.model.systemPrompt')}</Label>
                <Textarea
                  id="systemPrompt"
                  placeholder="You are a helpful medical receptionist..."
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={6}
                />
                <p className="text-sm text-muted-foreground">
                  {t('advancedPage.model.systemPromptHint')}
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temperature">
                    {t('advancedPage.model.temperature')} {temperature.toFixed(2)}
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
                    {t('advancedPage.model.temperatureHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxTokens">{t('advancedPage.model.maxTokens')}</Label>
                  <Input
                    type="number"
                    id="maxTokens"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('advancedPage.model.maxTokensHint')}
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
              <CardTitle>{t('advancedPage.recording.title')}</CardTitle>
              <CardDescription>
                {t('advancedPage.recording.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>{t('advancedPage.recording.callRecording')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('advancedPage.recording.callRecordingDesc')}
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
                  <Label>{t('advancedPage.recording.postCallAnalysis')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('advancedPage.recording.postCallAnalysisDesc')}
                  </p>
                </div>
                <Switch
                  checked={analysisEnabled}
                  onCheckedChange={setAnalysisEnabled}
                />
              </div>

              {analysisEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="analysisPrompt">{t('advancedPage.recording.analysisPrompt')}</Label>
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
              <CardTitle>{t('advancedPage.webhooks.title')}</CardTitle>
              <CardDescription>
                {t('advancedPage.webhooks.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="serverUrl">{t('advancedPage.webhooks.serverUrl')}</Label>
                <Input
                  id="serverUrl"
                  type="url"
                  placeholder="https://api.yourcompany.com/vapi/webhook"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  {t('advancedPage.webhooks.serverUrlHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="serverSecret">{t('advancedPage.webhooks.serverSecret')}</Label>
                <Input
                  id="serverSecret"
                  type="password"
                  placeholder="••••••••••••"
                  value={serverSecret}
                  onChange={(e) => setServerSecret(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  {t('advancedPage.webhooks.serverSecretHint')}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('advancedPage.advancedFeatures.title')}</CardTitle>
              <CardDescription>
                {t('advancedPage.advancedFeatures.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>{t('advancedPage.advancedFeatures.hipaa')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('advancedPage.advancedFeatures.hipaaDesc')}
                  </p>
                </div>
                <Switch
                  checked={hipaaEnabled}
                  onCheckedChange={setHipaaEnabled}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="backgroundSound">{t('advancedPage.advancedFeatures.backgroundSound')}</Label>
                <select
                  id="backgroundSound"
                  className="w-full border rounded-md p-2"
                  value={backgroundSound}
                  onChange={(e) => setBackgroundSound(e.target.value as any)}
                >
                  <option value="off">{t('advancedPage.advancedFeatures.none')}</option>
                  <option value="office">{t('advancedPage.advancedFeatures.officeAmbience')}</option>
                </select>
                <p className="text-sm text-muted-foreground">
                  {t('advancedPage.advancedFeatures.backgroundSoundHint')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">{t('advancedPage.dangerZone.title')}</CardTitle>
              <CardDescription>
                {t('advancedPage.dangerZone.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>{t('advancedPage.dangerZone.deleteAgent')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('advancedPage.dangerZone.deleteAgentDesc')}
                  </p>
                </div>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('advancedPage.dangerZone.delete')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

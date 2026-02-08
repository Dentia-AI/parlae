'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { toast } from 'sonner';
import { Upload, Link, FileText, Trash2 } from 'lucide-react';

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source: 'upload' | 'url' | 'text';
}

export default function KnowledgeBasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subAccountId = searchParams.get('subAccountId');

  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [activeTab, setActiveTab] = useState('text');

  // Text entry state
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  // URL entry state
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');

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

  const handleAddText = () => {
    if (!textTitle.trim() || !textContent.trim()) {
      toast.error('Please enter both title and content');
      return;
    }

    const newEntry: KnowledgeEntry = {
      id: Date.now().toString(),
      title: textTitle,
      content: textContent,
      source: 'text',
    };

    setKnowledgeEntries([...knowledgeEntries, newEntry]);
    setTextTitle('');
    setTextContent('');
    toast.success('Knowledge entry added');
  };

  const handleAddUrl = () => {
    if (!urlInput.trim() || !urlTitle.trim()) {
      toast.error('Please enter both URL and title');
      return;
    }

    const newEntry: KnowledgeEntry = {
      id: Date.now().toString(),
      title: urlTitle,
      content: `Content from: ${urlInput}`,
      source: 'url',
    };

    setKnowledgeEntries([...knowledgeEntries, newEntry]);
    setUrlInput('');
    setUrlTitle('');
    toast.success('URL added - will be scraped when deployed');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Handle file upload (mock for now)
    const file = files[0];
    const newEntry: KnowledgeEntry = {
      id: Date.now().toString(),
      title: file.name,
      content: `Uploaded file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`,
      source: 'upload',
    };

    setKnowledgeEntries([...knowledgeEntries, newEntry]);
    toast.success(`File "${file.name}" added`);
    
    // Reset input
    e.target.value = '';
  };

  const handleRemoveEntry = (id: string) => {
    setKnowledgeEntries(knowledgeEntries.filter((e) => e.id !== id));
    toast.success('Entry removed');
  };

  const handleContinue = () => {
    if (knowledgeEntries.length === 0) {
      toast.error('Please add at least one knowledge base entry');
      return;
    }

    // Store knowledge entries in session
    sessionStorage.setItem('knowledgeEntries', JSON.stringify(knowledgeEntries));
    router.push(`/home/ai-agent/setup/review?subAccountId=${subAccountId}`);
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="text-muted-foreground mt-2">
          Add information for your AI agent to reference during calls
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Knowledge Section */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Step 4: Add Knowledge</CardTitle>
              <CardDescription>
                Upload files, add URLs, or enter text manually
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="text">
                    <FileText className="h-4 w-4 mr-2" />
                    Text
                  </TabsTrigger>
                  <TabsTrigger value="url">
                    <Link className="h-4 w-4 mr-2" />
                    URL
                  </TabsTrigger>
                  <TabsTrigger value="upload">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </TabsTrigger>
                </TabsList>

                {/* Text Entry */}
                <TabsContent value="text" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="textTitle">Title</Label>
                    <Input
                      id="textTitle"
                      value={textTitle}
                      onChange={(e) => setTextTitle(e.target.value)}
                      placeholder="e.g., Business Hours"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="textContent">Content</Label>
                    <Textarea
                      id="textContent"
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="Enter the information your AI agent should know..."
                      rows={8}
                    />
                  </div>
                  <Button onClick={handleAddText} className="w-full">
                    Add Text Entry
                  </Button>
                </TabsContent>

                {/* URL Entry */}
                <TabsContent value="url" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="urlTitle">Title</Label>
                    <Input
                      id="urlTitle"
                      value={urlTitle}
                      onChange={(e) => setUrlTitle(e.target.value)}
                      placeholder="e.g., Website FAQ"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="urlInput">Website URL</Label>
                    <Input
                      id="urlInput"
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://www.yourbusiness.com/faq"
                    />
                    <p className="text-xs text-muted-foreground">
                      We'll scrape content from this URL for your knowledge base
                    </p>
                  </div>
                  <Button onClick={handleAddUrl} className="w-full">
                    Add URL
                  </Button>
                </TabsContent>

                {/* File Upload */}
                <TabsContent value="upload" className="space-y-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <Label htmlFor="fileUpload" className="cursor-pointer">
                      <p className="text-sm font-medium mb-2">Click to upload or drag and drop</p>
                      <p className="text-xs text-muted-foreground mb-4">
                        PDF, DOCX, or TXT (max 10MB)
                      </p>
                      <Input
                        id="fileUpload"
                        type="file"
                        accept=".pdf,.docx,.txt"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button variant="outline" type="button">
                        Choose File
                      </Button>
                    </Label>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Knowledge Entries List */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Added Knowledge</CardTitle>
              <CardDescription>
                {knowledgeEntries.length} {knowledgeEntries.length === 1 ? 'entry' : 'entries'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {knowledgeEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No entries yet. Add knowledge using the tabs on the left.
                </p>
              ) : (
                <div className="space-y-2">
                  {knowledgeEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{entry.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {entry.source === 'upload' && '📄 Upload'}
                          {entry.source === 'url' && '🔗 URL'}
                          {entry.source === 'text' && '📝 Text'}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveEntry(entry.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-6 mt-6">
        <Button
          variant="outline"
          onClick={() => router.push(`/home/ai-agent/setup/phone?subAccountId=${subAccountId}`)}
        >
          Back
        </Button>
        <Button onClick={handleContinue} disabled={knowledgeEntries.length === 0}>
          Continue to Review
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { RadioGroup, RadioGroupItem } from '@kit/ui/radio-group';
import { Label } from '@kit/ui/label';
import { Input } from '@kit/ui/input';
import { usePhoneNumbers, PhoneNumber } from '@kit/shared/ghl/hooks/use-voice-agent';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';

export default function PhoneNumberSelectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subAccountId = searchParams.get('subAccountId');

  const [areaCodeFilter, setAreaCodeFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const { data: phoneNumbers, isLoading } = usePhoneNumbers(areaCodeFilter, stateFilter);
  const [selectedPhone, setSelectedPhone] = useState<PhoneNumber | null>(null);

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

  const handleContinue = () => {
    if (!selectedPhone) {
      toast.error('Please select a phone number');
      return;
    }

    // Store selected phone in session
    sessionStorage.setItem('selectedPhone', JSON.stringify(selectedPhone));
    router.push(`/home/ai-agent/setup/knowledge?subAccountId=${subAccountId}`);
  };

  const handleSearch = () => {
    // Trigger re-fetch with new filters
    toast.info('Searching for phone numbers...');
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Select Phone Number</h1>
        <p className="text-muted-foreground mt-2">
          Choose a phone number for your AI agent
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 3: Phone Number Selection</CardTitle>
          <CardDescription>
            Select a phone number for your voice agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search Filters */}
          <div className="mb-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="areaCode">Area Code</Label>
                <Input
                  id="areaCode"
                  placeholder="e.g., 555"
                  value={areaCodeFilter}
                  onChange={(e) => setAreaCodeFilter(e.target.value)}
                  maxLength={3}
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  placeholder="e.g., CA"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value.toUpperCase())}
                  maxLength={2}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleSearch} className="w-full">
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2">Loading phone numbers...</span>
            </div>
          )}

          {phoneNumbers && phoneNumbers.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Found {phoneNumbers.length} available phone numbers
              </p>

              <RadioGroup
                value={selectedPhone?.phoneNumber}
                onValueChange={(value) => {
                  const phone = phoneNumbers.find((p) => p.phoneNumber === value);
                  setSelectedPhone(phone || null);
                }}
                className="space-y-2"
              >
                {phoneNumbers.map((phone) => (
                  <Card
                    key={phone.phoneNumber}
                    className={`cursor-pointer transition-colors ${
                      selectedPhone?.phoneNumber === phone.phoneNumber
                        ? 'border-primary border-2'
                        : 'hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedPhone(phone)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <RadioGroupItem value={phone.phoneNumber} id={phone.phoneNumber} />
                          <div>
                            <Label
                              htmlFor={phone.phoneNumber}
                              className="font-semibold text-lg cursor-pointer"
                            >
                              {phone.phoneNumber}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              {phone.friendlyName}
                              {phone.city && phone.state && ` • ${phone.city}, ${phone.state}`}
                            </p>
                            <div className="flex gap-2 mt-1">
                              {phone.capabilities.voice && (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                  Voice
                                </span>
                              )}
                              {phone.capabilities.sms && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                  SMS
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {phone.monthlyPrice && (
                          <div className="text-right">
                            <p className="font-semibold">${phone.monthlyPrice}/mo</p>
                            <p className="text-xs text-muted-foreground">Monthly</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </RadioGroup>
            </div>
          )}

          {phoneNumbers && phoneNumbers.length === 0 && !isLoading && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No phone numbers found. Try adjusting your search filters.
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-6 mt-6 border-t">
            <Button
              variant="outline"
              onClick={() => router.push(`/home/ai-agent/setup/voice?subAccountId=${subAccountId}`)}
            >
              Back
            </Button>
            <Button onClick={handleContinue} disabled={!selectedPhone}>
              Continue to Knowledge Base
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

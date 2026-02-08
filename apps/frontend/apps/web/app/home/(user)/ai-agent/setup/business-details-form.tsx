'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { useCreateSubAccount, CreateSubAccountData } from '@kit/shared/ghl/hooks/use-sub-account';
import { toast } from 'sonner';

const INDUSTRIES = [
  'Dental',
  'Medical',
  'Chiropractic',
  'Veterinary',
  'Optometry',
  'Physical Therapy',
  'Mental Health',
  'Other Healthcare',
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
];

export function BusinessDetailsForm() {
  const router = useRouter();
  const createSubAccount = useCreateSubAccount();
  
  const [formData, setFormData] = useState<CreateSubAccountData>({
    businessName: '',
    businessEmail: '',
    businessPhone: '',
    businessWebsite: '',
    businessAddress: '',
    city: '',
    state: '',
    postalCode: '',
    timezone: 'America/New_York',
    industry: 'Dental',
    country: 'US',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: keyof CreateSubAccountData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.businessName?.trim()) {
      newErrors.businessName = 'Business name is required';
    }

    if (formData.businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.businessEmail)) {
      newErrors.businessEmail = 'Invalid email format';
    }

    if (formData.businessPhone && !/^[\d\s\-\(\)\+]+$/.test(formData.businessPhone)) {
      newErrors.businessPhone = 'Invalid phone format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    try {
      const subAccount = await createSubAccount.mutateAsync(formData);
      
      toast.success('Business details saved successfully!');
      
      // Get agentType from URL params (for testing different flows)
      // Default to 'custom' if not specified
      // Use ?agentType=marketplace to test marketplace flow
      const searchParams = new URLSearchParams(window.location.search);
      const agentType = searchParams.get('agentType') || 'custom';
      
      console.log(`🔧 Testing flow: ${agentType}`);
      
      // Skip agent-type selection page and go directly to customize
      if (agentType === 'marketplace') {
        // For marketplace testing, go to marketplace browse page
        router.push(`/home/ai-agent/setup/marketplace?subAccountId=${subAccount.id}`);
      } else {
        // For custom agent, go directly to customize page
        router.push(`/home/ai-agent/setup/customize?subAccountId=${subAccount.id}&type=custom`);
      }
    } catch (error) {
      console.error('Error creating sub-account:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create sub-account');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Business Details</h2>
        <p className="text-muted-foreground">
          Tell us about your business so we can set up your AI voice agent.
        </p>
      </div>

      {/* Business Name */}
      <div className="space-y-2">
        <Label htmlFor="businessName">
          Business Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="businessName"
          value={formData.businessName}
          onChange={(e) => handleChange('businessName', e.target.value)}
          placeholder="e.g., Smith Dental Clinic"
          className={errors.businessName ? 'border-red-500' : ''}
        />
        {errors.businessName && (
          <p className="text-sm text-red-500">{errors.businessName}</p>
        )}
      </div>

      {/* Industry */}
      <div className="space-y-2">
        <Label htmlFor="industry">Industry</Label>
        <Select
          value={formData.industry}
          onValueChange={(value) => handleChange('industry', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((industry) => (
              <SelectItem key={industry} value={industry}>
                {industry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="businessEmail">Business Email</Label>
        <Input
          id="businessEmail"
          type="email"
          value={formData.businessEmail}
          onChange={(e) => handleChange('businessEmail', e.target.value)}
          placeholder="contact@yourbusiness.com"
          className={errors.businessEmail ? 'border-red-500' : ''}
        />
        {errors.businessEmail && (
          <p className="text-sm text-red-500">{errors.businessEmail}</p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="businessPhone">Business Phone</Label>
        <Input
          id="businessPhone"
          type="tel"
          value={formData.businessPhone}
          onChange={(e) => handleChange('businessPhone', e.target.value)}
          placeholder="(555) 123-4567"
          className={errors.businessPhone ? 'border-red-500' : ''}
        />
        {errors.businessPhone && (
          <p className="text-sm text-red-500">{errors.businessPhone}</p>
        )}
      </div>

      {/* Website */}
      <div className="space-y-2">
        <Label htmlFor="businessWebsite">Website</Label>
        <Input
          id="businessWebsite"
          type="url"
          value={formData.businessWebsite}
          onChange={(e) => handleChange('businessWebsite', e.target.value)}
          placeholder="https://www.yourbusiness.com"
        />
      </div>

      {/* Address */}
      <div className="space-y-2">
        <Label htmlFor="businessAddress">Street Address</Label>
        <Input
          id="businessAddress"
          value={formData.businessAddress}
          onChange={(e) => handleChange('businessAddress', e.target.value)}
          placeholder="123 Main Street"
        />
      </div>

      {/* City, State, Zip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => handleChange('city', e.target.value)}
            placeholder="New York"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value={formData.state}
            onChange={(e) => handleChange('state', e.target.value)}
            placeholder="NY"
            maxLength={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="postalCode">ZIP Code</Label>
          <Input
            id="postalCode"
            value={formData.postalCode}
            onChange={(e) => handleChange('postalCode', e.target.value)}
            placeholder="10001"
          />
        </div>
      </div>

      {/* Timezone */}
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Select
          value={formData.timezone}
          onValueChange={(value) => handleChange('timezone', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Submit Button */}
      <div className="flex justify-between pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={createSubAccount.isPending}
        >
          {createSubAccount.isPending ? 'Creating...' : 'Continue to Voice Selection'}
        </Button>
      </div>
    </form>
  );
}



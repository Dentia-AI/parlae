'use client';

import { useState, useEffect } from 'react';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { toast } from '@kit/ui/sonner';
import { Loader2, Upload, Eye } from 'lucide-react';
import { Alert, AlertDescription } from '@kit/ui/alert';

export default function BrandingSettingsPage() {
  const [branding, setBranding] = useState({
    logoUrl: '',
    primaryColor: '#3b82f6',
    businessName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    website: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    fetchBranding();
  }, []);

  const fetchBranding = async () => {
    try {
      const response = await fetch('/api/account/branding');
      if (response.ok) {
        const data = await response.json();
        if (data.branding) {
          setBranding({
            logoUrl: data.branding.brandingLogoUrl || '',
            primaryColor: data.branding.brandingPrimaryColor || '#3b82f6',
            businessName: data.branding.brandingBusinessName || '',
            contactEmail: data.branding.brandingContactEmail || '',
            contactPhone: data.branding.brandingContactPhone || '',
            address: data.branding.brandingAddress || '',
            website: data.branding.brandingWebsite || '',
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch branding:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/account/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      });

      if (response.ok) {
        toast.success('Branding settings saved successfully!');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save branding settings');
      }
    } catch (error) {
      toast.error('An error occurred while saving');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          These settings will be used in all appointment confirmation emails sent to your patients. 
          If not provided, default values will be used.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Branding Settings</CardTitle>
          <CardDescription>
            Configure your clinic's branding for email communications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo URL */}
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <div className="flex gap-2">
              <Input
                id="logoUrl"
                type="url"
                placeholder="https://yourdomain.com/logo.png"
                value={branding.logoUrl}
                onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
              />
              {branding.logoUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(branding.logoUrl, '_blank')}
                  title="Preview logo"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Recommended: 200x50px PNG with transparent background. Must be publicly accessible URL.
            </p>
            {branding.logoUrl && (
              <div className="mt-2 p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                <img 
                  src={branding.logoUrl} 
                  alt="Logo preview" 
                  className="h-12 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    toast.error('Failed to load logo. Check the URL.');
                  }}
                />
              </div>
            )}
          </div>

          {/* Primary Color */}
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Primary Brand Color</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="primaryColor"
                type="color"
                value={branding.primaryColor}
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                className="w-20 h-10 cursor-pointer"
              />
              <Input
                type="text"
                placeholder="#3b82f6"
                value={branding.primaryColor}
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                className="flex-1"
                maxLength={7}
              />
              <div 
                className="w-10 h-10 rounded border"
                style={{ backgroundColor: branding.primaryColor }}
                title="Color preview"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Used for buttons and highlights in emails
            </p>
          </div>

          {/* Business Name */}
          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name (Optional)</Label>
            <Input
              id="businessName"
              placeholder="Your Clinic Name"
              value={branding.businessName}
              onChange={(e) => setBranding({ ...branding, businessName: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              Leave blank to use your account name in emails
            </p>
          </div>

          {/* Contact Email */}
          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact Email</Label>
            <Input
              id="contactEmail"
              type="email"
              placeholder="info@yourclinic.com"
              value={branding.contactEmail}
              onChange={(e) => setBranding({ ...branding, contactEmail: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              Email address patients can use to contact you
            </p>
          </div>

          {/* Contact Phone */}
          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact Phone</Label>
            <Input
              id="contactPhone"
              type="tel"
              placeholder="(555) 123-4567"
              value={branding.contactPhone}
              onChange={(e) => setBranding({ ...branding, contactPhone: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              Phone number patients can call for changes or questions
            </p>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address">Physical Address</Label>
            <Input
              id="address"
              placeholder="123 Main St, City, Province A1B 2C3"
              value={branding.address}
              onChange={(e) => setBranding({ ...branding, address: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              Will appear in email footer
            </p>
          </div>

          {/* Website */}
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              placeholder="https://yourdomain.com"
              value={branding.website}
              onChange={(e) => setBranding({ ...branding, website: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              Your clinic's website URL
            </p>
          </div>

          {/* Preview Section */}
          <div className="pt-4">
            <Alert>
              <AlertDescription>
                <strong>Preview:</strong> Your branding will appear in appointment confirmation, 
                cancellation, and reschedule emails sent to patients.
              </AlertDescription>
            </Alert>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Branding Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


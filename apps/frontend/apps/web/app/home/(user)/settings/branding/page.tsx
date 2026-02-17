'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { toast } from '@kit/ui/sonner';
import { Loader2, Upload, Eye } from 'lucide-react';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

export default function BrandingSettingsPage() {
  const { t } = useTranslation();
  const csrfToken = useCsrfToken();
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Client-side validation
  const validate = (data: typeof branding) => {
    const errs: Record<string, string> = {};
    if (!data.businessName.trim()) {
      errs.businessName = t('common:settings.branding.validation.businessNameRequired', 'Business name is required');
    }
    if (!data.contactEmail.trim()) {
      errs.contactEmail = t('common:settings.branding.validation.contactEmailRequired', 'Contact email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail.trim())) {
      errs.contactEmail = t('common:settings.branding.validation.contactEmailInvalid', 'Please enter a valid email address');
    }
    if (!data.contactPhone.trim()) {
      errs.contactPhone = t('common:settings.branding.validation.contactPhoneRequired', 'Contact phone is required');
    }
    if (data.logoUrl.trim() && !/^https?:\/\/.+/.test(data.logoUrl.trim())) {
      errs.logoUrl = t('common:settings.branding.validation.logoUrlInvalid', 'Please enter a valid URL');
    }
    if (data.website.trim() && !/^https?:\/\/.+/.test(data.website.trim())) {
      errs.website = t('common:settings.branding.validation.websiteInvalid', 'Please enter a valid URL');
    }
    if (data.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(data.primaryColor)) {
      errs.primaryColor = t('common:settings.branding.validation.colorInvalid', 'Please enter a valid hex color');
    }
    return errs;
  };

  const validationErrors = validate(branding);
  const isFormValid = Object.keys(validationErrors).length === 0;

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
    const errs = validate(branding);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/account/branding', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify(branding),
      });

      if (response.ok) {
        toast.success(t('common:settings.branding.saveSuccess'));
      } else {
        const error = await response.json();
        toast.error(error.error || t('common:settings.branding.saveError'));
      }
    } catch (error) {
      toast.error(t('common:settings.branding.saveErrorGeneric'));
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="rounded-xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {t('common:settings.branding.infoText')}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('common:settings.branding.title')}</CardTitle>
          <CardDescription>
            {t('common:settings.branding.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Business Name * */}
          <div className="space-y-2">
            <Label htmlFor="businessName">
              {t('common:settings.branding.businessName')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="businessName"
              placeholder="Your Clinic Name"
              value={branding.businessName}
              onChange={(e) => setBranding({ ...branding, businessName: e.target.value })}
              className={errors.businessName ? 'border-destructive' : ''}
            />
            {errors.businessName ? (
              <p className="text-sm text-destructive">{errors.businessName}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('common:settings.branding.businessNameHint')}
              </p>
            )}
          </div>

          {/* Contact Email * */}
          <div className="space-y-2">
            <Label htmlFor="contactEmail">
              {t('common:settings.branding.contactEmail')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contactEmail"
              type="email"
              placeholder="info@yourclinic.com"
              value={branding.contactEmail}
              onChange={(e) => setBranding({ ...branding, contactEmail: e.target.value })}
              className={errors.contactEmail ? 'border-destructive' : ''}
            />
            {errors.contactEmail ? (
              <p className="text-sm text-destructive">{errors.contactEmail}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('common:settings.branding.contactEmailHint')}
              </p>
            )}
          </div>

          {/* Contact Phone * */}
          <div className="space-y-2">
            <Label htmlFor="contactPhone">
              {t('common:settings.branding.contactPhone')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contactPhone"
              type="tel"
              placeholder="(555) 123-4567"
              value={branding.contactPhone}
              onChange={(e) => setBranding({ ...branding, contactPhone: e.target.value })}
              className={errors.contactPhone ? 'border-destructive' : ''}
            />
            {errors.contactPhone ? (
              <p className="text-sm text-destructive">{errors.contactPhone}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('common:settings.branding.contactPhoneHint')}
              </p>
            )}
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address">{t('common:settings.branding.address')}</Label>
            <Input
              id="address"
              placeholder="123 Main St, City, Province A1B 2C3"
              value={branding.address}
              onChange={(e) => setBranding({ ...branding, address: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              {t('common:settings.branding.addressHint')}
            </p>
          </div>

          {/* Logo URL */}
          <div className="space-y-2">
            <Label htmlFor="logoUrl">{t('common:settings.branding.logoUrl')}</Label>
            <div className="flex gap-2">
              <Input
                id="logoUrl"
                type="url"
                placeholder="https://yourdomain.com/logo.png"
                value={branding.logoUrl}
                onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                className={errors.logoUrl ? 'border-destructive' : ''}
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
            {errors.logoUrl ? (
              <p className="text-sm text-destructive">{errors.logoUrl}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('common:settings.branding.logoRecommendation')}
              </p>
            )}
            {branding.logoUrl && !errors.logoUrl && (
              <div className="mt-2 p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">{t('common:settings.branding.preview')}</p>
                <img 
                  src={branding.logoUrl} 
                  alt={t('common:settings.branding.logoPreviewAlt')} 
                  className="h-12 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    toast.error(t('common:settings.branding.logoLoadError'));
                  }}
                />
              </div>
            )}
          </div>

          {/* Primary Color */}
          <div className="space-y-2">
            <Label htmlFor="primaryColor">{t('common:settings.branding.primaryColor')}</Label>
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
                className={`flex-1 ${errors.primaryColor ? 'border-destructive' : ''}`}
                maxLength={7}
              />
              <div 
                className="w-10 h-10 rounded border"
                style={{ backgroundColor: branding.primaryColor }}
                title="Color preview"
              />
            </div>
            {errors.primaryColor ? (
              <p className="text-sm text-destructive">{errors.primaryColor}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('common:settings.branding.colorUsage')}
              </p>
            )}
          </div>

          {/* Website */}
          <div className="space-y-2">
            <Label htmlFor="website">{t('common:settings.branding.website')}</Label>
            <Input
              id="website"
              type="url"
              placeholder="https://yourdomain.com"
              value={branding.website}
              onChange={(e) => setBranding({ ...branding, website: e.target.value })}
              className={errors.website ? 'border-destructive' : ''}
            />
            {errors.website ? (
              <p className="text-sm text-destructive">{errors.website}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('common:settings.branding.websiteHint')}
              </p>
            )}
          </div>

          {/* Preview Section */}
          <div className="pt-4">
            <div className="rounded-xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <strong className="text-foreground">{t('common:settings.branding.preview')}</strong> {t('common:settings.branding.previewNote')}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={isLoading || !isFormValid}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common:settings.branding.saveButton')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


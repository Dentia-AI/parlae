'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { RadioGroup, RadioGroupItem } from '@kit/ui/radio-group';
import { Label } from '@kit/ui/label';
import { Badge } from '@kit/ui/badge';
import { 
  PhoneForwarded, 
  PhoneCall, 
  Network,
  Clock,
  CheckCircle2,
  AlertCircle,
  Info
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';

type IntegrationMethod = 'ported' | 'forwarded' | 'sip';

interface PhoneMethodSelectorProps {
  accountId: string;
  businessName: string;
  onMethodSelected: (method: IntegrationMethod) => void;
}

export function PhoneMethodSelector({ 
  accountId, 
  businessName, 
  onMethodSelected 
}: PhoneMethodSelectorProps) {
  const [selectedMethod, setSelectedMethod] = useState<IntegrationMethod | null>(null);

  const methods = [
    {
      id: 'sip' as const,
      name: 'SIP Trunk',
      icon: Network,
      setupTime: 'Hours',
      difficulty: 'Advanced',
      quality: 'Excellent',
      recommended: true,
      description: 'Connect your existing PBX system via SIP',
      pros: [
        'Works with existing PBX',
        'High call quality',
        'Flexible routing options',
        'No number porting needed',
      ],
      cons: [
        'Requires technical setup',
        'Need existing PBX system',
        'May need IT assistance',
      ],
      bestFor: 'Clinics with existing phone systems',
    },
    {
      id: 'forwarded' as const,
      name: 'Call Forwarding',
      icon: PhoneForwarded,
      setupTime: 'Minutes',
      difficulty: 'Easy',
      quality: 'Good',
      recommended: false,
      description: 'Forward calls from your existing number to our system',
      pros: [
        'Setup in minutes',
        'No paperwork required',
        'Keep full control of your number',
        'Easy to disable',
      ],
      cons: [
        'Caller ID may not show correctly',
        'Slightly lower call quality',
        'May incur forwarding charges',
      ],
      bestFor: 'Quick testing, temporary setup',
    },
    {
      id: 'ported' as const,
      name: 'Port Number',
      icon: PhoneCall,
      setupTime: '7-14 days',
      difficulty: 'Medium',
      quality: 'Best',
      recommended: false,
      description: 'Transfer your existing phone number to our system',
      pros: [
        'Best call quality',
        'Keep your existing number',
        'Full control over routing',
        'Perfect caller ID',
      ],
      cons: [
        'Takes 7-14 days to complete',
        'Requires paperwork (LOA)',
        'Temporary service interruption possible',
      ],
      bestFor: 'Long-term use, maximum quality',
    },
  ];

  const handleContinue = () => {
    if (!selectedMethod) {
      toast.error('Please select a phone integration method');
      return;
    }

    // Store selection in session storage
    sessionStorage.setItem('phoneIntegrationMethod', selectedMethod);
    
    // Navigate to method-specific setup
    onMethodSelected(selectedMethod);
  };

  return (
    <div className="space-y-6">
      <RadioGroup value={selectedMethod || ''} onValueChange={(value) => setSelectedMethod(value as IntegrationMethod)}>
        <div className="space-y-4">
          {methods.map((method) => {
            const Icon = method.icon;
            const isSelected = selectedMethod === method.id;

            return (
              <Card 
                key={method.id}
                className={`cursor-pointer transition-all ${
                  isSelected 
                    ? 'ring-2 ring-primary border-primary' 
                    : 'hover:border-primary/50'
                }`}
                onClick={() => setSelectedMethod(method.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <RadioGroupItem value={method.id} id={method.id} className="mt-1" />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5 text-primary" />
                          <Label htmlFor={method.id} className="text-lg font-semibold cursor-pointer">
                            {method.name}
                          </Label>
                          {method.recommended && (
                            <Badge variant="default" className="bg-green-600">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-sm">
                          {method.description}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Stats */}
                  <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Setup:</span>
                      <span className="font-medium">{method.setupTime}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Quality:</span>
                      <span className="font-medium">{method.quality}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Difficulty:</span>
                      <span className="font-medium">{method.difficulty}</span>
                    </div>
                  </div>

                  {/* Pros & Cons */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div className="font-medium text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        Pros
                      </div>
                      <ul className="space-y-1">
                        {method.pros.map((pro, idx) => (
                          <li key={idx} className="text-muted-foreground flex items-start gap-1">
                            <span className="text-green-600 mt-0.5">•</span>
                            {pro}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <div className="font-medium text-orange-600 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        Cons
                      </div>
                      <ul className="space-y-1">
                        {method.cons.map((con, idx) => (
                          <li key={idx} className="text-muted-foreground flex items-start gap-1">
                            <span className="text-orange-600 mt-0.5">•</span>
                            {con}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Best For */}
                  <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                    <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium">Best for:</div>
                      <div className="text-sm text-muted-foreground">{method.bestFor}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </RadioGroup>

      <Button 
        onClick={handleContinue}
        disabled={!selectedMethod}
        size="lg"
        className="w-full"
      >
        Continue with {selectedMethod ? methods.find(m => m.id === selectedMethod)?.name : 'Selected Method'}
      </Button>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import {
  PhoneForwarded,
  Info,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';

interface CallForwardingInstructionsProps {
  twilioNumber: string;
  clinicNumber?: string;
  defaultExpanded?: boolean;
  variant?: 'card' | 'inline';
}

export function CallForwardingInstructions({
  twilioNumber,
  clinicNumber,
  defaultExpanded = false,
  variant = 'card',
}: CallForwardingInstructionsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const copyNumber = () => {
    navigator.clipboard.writeText(twilioNumber);
    setCopied(true);
    toast.success('Number copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const content = (
    <div className="space-y-5 text-sm">
      {/* Number to forward to */}
      <div className="rounded-xl bg-primary/[0.06] ring-1 ring-primary/20 p-4">
        <div className="text-xs text-muted-foreground mb-1">Forward your calls to this number:</div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold font-mono tracking-tight">{twilioNumber}</span>
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={copyNumber}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        {clinicNumber && (
          <div className="text-xs text-muted-foreground mt-1.5">
            From your clinic number: <span className="font-mono font-medium text-foreground">{clinicNumber}</span>
          </div>
        )}
      </div>

      {/* Quick steps */}
      <div className="rounded-xl bg-muted/60 p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <PhoneForwarded className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Quick Setup Steps</span>
        </div>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground leading-relaxed">
          <li>Pick up your clinic phone and dial the forwarding code below</li>
          <li>
            Enter the Twilio number:{' '}
            <strong className="font-mono text-foreground">{twilioNumber}</strong>
          </li>
          <li>You should hear a confirmation tone — forwarding is active</li>
          <li>Test by calling your clinic number from a different phone</li>
        </ol>
      </div>

      {/* Recommended setup */}
      <div className="rounded-xl ring-1 ring-primary/20 bg-primary/[0.03] p-4">
        <h4 className="font-semibold mb-1.5 text-sm">
          Recommended: No-Answer + Busy Forwarding
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Set up both types for complete coverage. Staff answers during hours. If busy or
          no answer, calls go to AI. After hours, nobody answers, so AI handles it.
        </p>
      </div>

      {/* Canadian carriers */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          Canadian Carriers (Bell, Rogers, Telus)
        </h4>
        <div className="space-y-2">
          <CarrierCode
            label="No-Answer Forwarding"
            desc="AI answers when nobody picks up"
            activate={`*92 + ${twilioNumber}`}
            disable="*93"
            recommended
          />
          <CarrierCode
            label="Busy Forwarding"
            desc="AI answers when lines are busy"
            activate={`*90 + ${twilioNumber}`}
            disable="*91"
            recommended
          />
          <CarrierCode
            label="All Calls (Unconditional)"
            desc="Every call goes straight to AI"
            activate={`*72 + ${twilioNumber}`}
            disable="*73"
          />
        </div>
      </div>

      {/* US carriers */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          US Carriers (AT&T, Verizon, T-Mobile)
        </h4>
        <div className="space-y-2">
          <CarrierCode
            label="No-Answer Forwarding"
            activate={`*61*${twilioNumber}#`}
            disable="#61#"
            recommended
          />
          <CarrierCode
            label="Busy Forwarding"
            activate={`*67*${twilioNumber}#`}
            disable="#67#"
            recommended
          />
          <CarrierCode
            label="All Calls (Unconditional)"
            activate={`*21*${twilioNumber}#`}
            disable="#21#"
          />
        </div>
      </div>

      {/* VoIP */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          VoIP / PBX Systems
        </h4>
        <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
          <li>Log into your VoIP admin portal</li>
          <li>Navigate to Call Routing or Call Forwarding</li>
          <li>Add <strong className="font-mono text-foreground">{twilioNumber}</strong> as a forwarding destination</li>
          <li>Set to forward all calls, or configure no-answer/busy rules</li>
          <li>Save and test with a call</li>
        </ol>
      </div>
    </div>
  );

  if (variant === 'inline') {
    return content;
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-500/10 p-2.5">
              <PhoneForwarded className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Set Up Call Forwarding</CardTitle>
              <CardDescription className="text-sm">
                Forward your clinic calls to your AI receptionist
              </CardDescription>
            </div>
          </div>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </CardHeader>
      {expanded && <CardContent>{content}</CardContent>}
    </Card>
  );
}

function CarrierCode({
  label,
  desc,
  activate,
  disable,
  recommended,
}: {
  label: string;
  desc?: string;
  activate: string;
  disable: string;
  recommended?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${recommended ? 'bg-green-50/60 dark:bg-green-950/20 ring-1 ring-green-200/50 dark:ring-green-800/30' : 'bg-muted/40'}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${recommended ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
          {label}
        </span>
        {recommended && (
          <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded">
            Recommended
          </span>
        )}
      </div>
      {desc && (
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      )}
      <div className="mt-1.5 font-mono text-xs text-muted-foreground">
        On: <strong className="text-foreground">{activate}</strong>
        {'  '}Off: <strong className="text-foreground">{disable}</strong>
      </div>
    </div>
  );
}

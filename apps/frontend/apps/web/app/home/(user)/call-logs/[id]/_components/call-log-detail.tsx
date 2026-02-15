'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Separator } from '@kit/ui/separator';
import {
  Phone,
  Clock,
  ArrowLeft,
  Calendar,
  User,
  Mail,
  FileText,
  AlertCircle,
  CheckCircle2,
  Shield,
  MessageSquare,
  Activity,
  DollarSign,
  Stethoscope,
  ArrowRightLeft,
  Mic,
  ListChecks,
  Tag,
} from 'lucide-react';

interface CallLogDetail {
  id: string;
  vapiCallId: string | null;
  phoneNumber: string;
  callType: string;
  direction: string;
  duration: number | null;
  status: string;
  outcome: string;
  callReason: string | null;
  urgencyLevel: string | null;
  contactName: string | null;
  contactEmail: string | null;
  transcript: string | null;
  summary: string | null;
  recordingUrl: string | null;
  structuredData: {
    patientName?: string;
    patientPhone?: string;
    patientEmail?: string;
    patientId?: string;
    isNewPatient?: boolean;
    callReason?: string;
    callOutcome?: string;
    appointmentBooked?: boolean;
    appointmentCancelled?: boolean;
    appointmentRescheduled?: boolean;
    appointmentType?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    providerName?: string;
    insuranceVerified?: boolean;
    insuranceProvider?: string;
    paymentDiscussed?: boolean;
    customerSentiment?: string;
    urgencyLevel?: string;
    followUpRequired?: boolean;
    followUpNotes?: string;
    transferredToStaff?: boolean;
    transferredTo?: string;
    callSummary?: string;
    keyTopicsDiscussed?: string[];
    actionsPerformed?: string[];
  } | null;
  appointmentSet: boolean;
  insuranceVerified: boolean;
  insuranceProvider: string | null;
  paymentPlanDiscussed: boolean;
  paymentPlanAmount: number | null;
  transferredToStaff: boolean;
  transferredTo: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
  customerSentiment: string | null;
  aiConfidence: number | null;
  costCents: number | null;
  metadata: any;
  actions: any;
  callNotes: string | null;
  voiceAgent: { id: string; name: string; phoneNumber: string | null } | null;
  callStartedAt: string;
  callEndedAt: string | null;
  createdAt: string;
}

const outcomeLabels: Record<string, string> = {
  BOOKED: 'Appointment Booked',
  TRANSFERRED: 'Transferred to Staff',
  INSURANCE_INQUIRY: 'Insurance Inquiry',
  PAYMENT_PLAN: 'Payment Plan',
  INFORMATION: 'Information Provided',
  VOICEMAIL: 'Voicemail',
  NO_ANSWER: 'No Answer',
  BUSY: 'Busy',
  FAILED: 'Failed',
  OTHER: 'Other',
};

const outcomeColors: Record<string, string> = {
  BOOKED: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  TRANSFERRED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  INSURANCE_INQUIRY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  PAYMENT_PLAN: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  INFORMATION: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300',
};

const sentimentLabels: Record<string, { label: string; icon: string; color: string }> = {
  very_positive: { label: 'Very Positive', icon: '😊', color: 'text-green-600' },
  positive: { label: 'Positive', icon: '🙂', color: 'text-green-500' },
  neutral: { label: 'Neutral', icon: '😐', color: 'text-gray-500' },
  negative: { label: 'Negative', icon: '😟', color: 'text-orange-500' },
  very_negative: { label: 'Very Negative', icon: '😠', color: 'text-red-500' },
  anxious: { label: 'Anxious', icon: '😰', color: 'text-yellow-600' },
  urgent: { label: 'Urgent', icon: '🚨', color: 'text-red-600' },
};

function formatDuration(seconds: number | null) {
  if (!seconds) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Transcript Parser ──────────────────────────────────────────────────

function TranscriptViewer({ transcript }: { transcript: string }) {
  // Vapi transcripts can be plain text or structured
  // Try to parse as conversation turns (lines starting with "AI:" or "User:" etc.)
  const lines = transcript.split('\n').filter(Boolean);

  // Check if it looks like a structured transcript
  const isStructured = lines.some(line =>
    /^(AI|User|Assistant|Customer|Caller|Agent|Bot|Human):/i.test(line.trim())
  );

  if (!isStructured) {
    // Plain text transcript
    return (
      <div className="bg-muted/30 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap font-mono">
        {transcript}
      </div>
    );
  }

  // Structured conversation view
  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        const match = line.match(/^(AI|User|Assistant|Customer|Caller|Agent|Bot|Human):\s*(.*)/i);
        if (!match) {
          return (
            <div key={index} className="text-xs text-muted-foreground italic px-3">
              {line}
            </div>
          );
        }

        const [, speaker, text] = match;
        const isAI = /^(AI|Assistant|Agent|Bot)/i.test(speaker!);

        return (
          <div
            key={index}
            className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                isAI
                  ? 'bg-muted/50 border'
                  : 'bg-primary/10 border border-primary/20'
              }`}
            >
              <p className="text-[10px] font-medium text-muted-foreground mb-0.5 uppercase tracking-wide">
                {isAI ? 'AI Assistant' : 'Caller'}
              </p>
              <p className="leading-relaxed">{text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function CallLogDetail({ callId }: { callId: string }) {
  const router = useRouter();
  const [call, setCall] = useState<CallLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  useEffect(() => {
    fetchCallDetail();
  }, [callId]);

  const fetchCallDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/call-logs/${callId}`);
      if (!response.ok) {
        if (response.status === 404) setError('Call record not found.');
        else if (response.status === 401) setError('You do not have access to this record.');
        else setError('Failed to load call record.');
        return;
      }
      const data = await response.json();
      setCall(data);
    } catch (err) {
      setError('An error occurred while loading the call record.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
          <p className="text-sm text-muted-foreground">Loading call record...</p>
        </div>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
        <p className="font-medium">{error || 'Call record not found'}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/home/call-logs')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Call Logs
        </Button>
      </div>
    );
  }

  const sd = call.structuredData;
  const sentiment = call.customerSentiment ? sentimentLabels[call.customerSentiment] : null;

  return (
    <div className="space-y-4">
      {/* HIPAA Notice */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
        <Shield className="h-3.5 w-3.5 flex-shrink-0" />
        <span>HIPAA Protected: This record contains PHI. Your access has been logged.</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/home/call-logs')} className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Call Logs
          </Button>
          <h2 className="text-xl font-bold">
            {call.contactName || 'Unknown Caller'}
          </h2>
          <p className="text-sm text-muted-foreground">{call.phoneNumber}</p>
        </div>
        <div className="text-right">
          <Badge className={`${outcomeColors[call.outcome] || outcomeColors.OTHER}`}>
            {outcomeLabels[call.outcome] || call.outcome}
          </Badge>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDateTime(call.callStartedAt)}
          </p>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="font-semibold text-sm">{formatDuration(call.duration)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Sentiment</p>
                <p className="font-semibold text-sm">
                  {sentiment ? `${sentiment.icon} ${sentiment.label}` : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="font-semibold text-sm capitalize">
                  {(call.callReason || 'N/A').replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Cost</p>
                <p className="font-semibold text-sm">
                  {call.costCents ? `$${(call.costCents / 100).toFixed(2)}` : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Left Column: Transcript + Summary */}
        <div className="md:col-span-2 space-y-4">
          {/* AI Summary */}
          {(call.summary || sd?.callSummary) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">
                  {call.summary || sd?.callSummary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Transcript */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  Call Transcript
                </CardTitle>
                {call.recordingUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={call.recordingUrl} target="_blank" rel="noopener noreferrer">
                      Play Recording
                    </a>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {call.transcript ? (
                <div>
                  <div className={!showFullTranscript ? 'max-h-96 overflow-hidden relative' : ''}>
                    <TranscriptViewer transcript={call.transcript} />
                    {!showFullTranscript && call.transcript.length > 1000 && (
                      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent" />
                    )}
                  </div>
                  {call.transcript.length > 1000 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => setShowFullTranscript(!showFullTranscript)}
                    >
                      {showFullTranscript ? 'Show Less' : 'Show Full Transcript'}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Mic className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No transcript available for this call.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions Performed */}
          {sd?.actionsPerformed && sd.actionsPerformed.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Actions Performed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {sd.actionsPerformed.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Structured Data & Details */}
        <div className="space-y-4">
          {/* Contact Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" />
                Contact Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <DetailRow label="Name" value={call.contactName || sd?.patientName} />
              <DetailRow label="Phone" value={call.phoneNumber} />
              <DetailRow label="Email" value={call.contactEmail || sd?.patientEmail} />
              {sd?.patientId && <DetailRow label="Patient ID" value={sd.patientId} />}
              {sd?.isNewPatient !== undefined && (
                <DetailRow label="New Patient" value={sd.isNewPatient ? 'Yes' : 'No'} />
              )}
            </CardContent>
          </Card>

          {/* Appointment Details */}
          {(call.appointmentSet || sd?.appointmentBooked || sd?.appointmentCancelled || sd?.appointmentRescheduled) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Appointment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sd?.appointmentBooked && <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Booked</Badge>}
                {sd?.appointmentCancelled && <Badge className="bg-red-100 text-red-800">Cancelled</Badge>}
                {sd?.appointmentRescheduled && <Badge className="bg-blue-100 text-blue-800">Rescheduled</Badge>}
                <DetailRow label="Type" value={sd?.appointmentType} />
                <DetailRow label="Date" value={sd?.appointmentDate} />
                <DetailRow label="Time" value={sd?.appointmentTime} />
                <DetailRow label="Provider" value={sd?.providerName} />
              </CardContent>
            </Card>
          )}

          {/* Insurance & Billing */}
          {(call.insuranceVerified || call.paymentPlanDiscussed) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Stethoscope className="h-4 w-4" />
                  Insurance & Billing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {call.insuranceVerified && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Insurance Verified</span>
                  </div>
                )}
                <DetailRow label="Provider" value={call.insuranceProvider || sd?.insuranceProvider} />
                {call.paymentPlanDiscussed && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">Payment Plan Discussed</span>
                  </div>
                )}
                {call.paymentPlanAmount && (
                  <DetailRow label="Amount" value={`$${(call.paymentPlanAmount / 100).toFixed(2)}`} />
                )}
              </CardContent>
            </Card>
          )}

          {/* Follow-up */}
          {call.followUpRequired && (
            <Card className="border-orange-200 dark:border-orange-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-orange-700 dark:text-orange-400">
                  <AlertCircle className="h-4 w-4" />
                  Follow-up Required
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sd?.followUpNotes && (
                  <p className="text-sm">{sd.followUpNotes}</p>
                )}
                {call.followUpDate && (
                  <DetailRow label="Date" value={new Date(call.followUpDate).toLocaleDateString()} />
                )}
              </CardContent>
            </Card>
          )}

          {/* Topics Discussed */}
          {sd?.keyTopicsDiscussed && sd.keyTopicsDiscussed.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Topics Discussed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {sd.keyTopicsDiscussed.map((topic, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Call Metadata */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Call Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <DetailRow label="Call ID" value={call.vapiCallId} mono />
              <DetailRow label="Type" value={call.callType} />
              <DetailRow label="Status" value={call.status} />
              <DetailRow label="Started" value={formatDateTime(call.callStartedAt)} />
              {call.callEndedAt && <DetailRow label="Ended" value={formatDateTime(call.callEndedAt)} />}
              {call.voiceAgent && <DetailRow label="Agent" value={call.voiceAgent.name} />}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className={`text-xs text-right ${mono ? 'font-mono' : ''} truncate max-w-[65%]`}>{value}</span>
    </div>
  );
}

import { redirect } from 'next/navigation';

export const metadata = {
  title: 'AI Receptionist Setup',
};

// Redirect old GHL-based setup to new Twilio+Vapi setup
export default function AIAgentSetupPage() {
  redirect('/home/receptionist/setup');
}


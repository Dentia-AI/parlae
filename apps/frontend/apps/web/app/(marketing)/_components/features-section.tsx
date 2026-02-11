'use client';

import { Phone, Calendar, Clock, MessageSquare, BarChart, Shield } from 'lucide-react';
import { Card } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';

const FEATURES = [
  {
    icon: Phone,
    title: '24/7 Call Handling',
    description: 'Never miss a patient call again. Our AI agent answers calls instantly, any time of day or night.',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: Calendar,
    title: 'Smart Scheduling',
    description: 'Automatically book appointments directly into your PMS with intelligent availability detection.',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    icon: MessageSquare,
    title: 'Natural Conversations',
    description: 'Engage patients with human-like conversations in their preferred language, building trust and satisfaction.',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    icon: Clock,
    title: 'Instant Responses',
    description: 'Reduce wait times to zero. Patients get immediate answers to their questions and concerns.',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  {
    icon: BarChart,
    title: 'Analytics & Insights',
    description: 'Track call patterns, patient inquiries, and booking trends to optimize your practice operations.',
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
  },
  {
    icon: Shield,
    title: 'HIPAA Compliant',
    description: 'Enterprise-grade security ensures patient data is protected with full HIPAA compliance.',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
];

export function FeaturesSection() {
  return (
    <div className="container mx-auto px-4 py-24">
      <div className="mb-16 text-center">
        <h2 className="mb-4 text-4xl font-bold tracking-tight">
          Everything Your Practice Needs
        </h2>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Powerful AI capabilities designed specifically for healthcare practices
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Card
            key={index}
            className={cn(
              'group relative overflow-hidden border-border/50 p-8 transition-all duration-300',
              'hover:border-primary/50 hover:shadow-lg',
            )}
          >
            <div
              className={cn(
                'mb-6 inline-flex rounded-xl p-3',
                feature.bgColor,
              )}
            >
              <feature.icon className={cn('h-6 w-6', feature.color)} />
            </div>

            <h3 className="mb-3 text-xl font-semibold">{feature.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {feature.description}
            </p>

            {/* Hover effect */}
            <div className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className={cn('h-full w-full', feature.bgColor, 'opacity-5')} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

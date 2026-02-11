'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, Calendar, Shield, TrendingUp, Users, Clock } from 'lucide-react';
import { Card } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';
import { Trans, useTranslation } from 'react-i18next';

const FEATURES = [
  {
    id: 'time-saved',
    icon: Clock,
    titleKey: 'featureStaffTimeTitle',
    descKey: 'featureStaffTimeDesc',
    type: 'time-saved',
    metric: { hours: 15, labelKey: 'hoursSavedWeek' },
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    id: 'revenue',
    icon: TrendingUp,
    titleKey: 'featureRevenueTitle',
    descKey: 'featureRevenueDesc',
    type: 'chart',
    metric: { value: '$24,800', growth: '+34%', labelKey: 'additionalRevenue' },
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    id: 'workload',
    icon: Phone,
    titleKey: 'featureCallVolumeTitle',
    descKey: 'featureCallVolumeDesc',
    type: 'workload',
    metric: { handled: 80, byStaff: 20 },
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    id: 'efficiency',
    icon: Users,
    titleKey: 'featureProductivityTitle',
    descKey: 'featureProductivityDesc',
    type: 'efficiency',
    metric: { multiplier: '3x', labelKey: 'productivityGain' },
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  {
    id: 'insurance',
    icon: Shield,
    titleKey: 'featureInsuranceTitle',
    descKey: 'featureInsuranceDesc',
    type: 'logos',
    logos: ['UnitedHealthcare', 'Aetna', 'Cigna', 'Humana', 'Medicaid', 'CMS.gov'],
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  {
    id: 'capacity',
    icon: Calendar,
    titleKey: 'featureCapacityTitle',
    descKey: 'featureCapacityDesc',
    type: 'capacity',
    metric: { multiplier: '2x', labelKey: 'morePatientsServed' },
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
  },
];

export function AnimatedFeaturesSection() {
  return (
    <div className="container mx-auto px-4 py-24">
      <div className="mb-16 text-center">
        <h2 className="mb-4 text-4xl font-bold tracking-tight">
          <Trans i18nKey="marketing:featuresTitle" />
        </h2>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          <Trans i18nKey="marketing:featuresSubtitle" />
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <AnimatedFeatureCard key={feature.id} feature={feature} index={index} />
        ))}
      </div>
    </div>
  );
}

function AnimatedFeatureCard({ feature, index }: { feature: typeof FEATURES[0]; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <Card
      ref={cardRef}
      className={cn(
        'group relative overflow-hidden border-border/50 p-6 transition-all duration-300',
        'hover:border-primary/50 hover:shadow-lg',
        isVisible ? 'animate-fade-in-up' : 'opacity-0',
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className={cn('mb-4 inline-flex rounded-xl p-3', feature.bgColor)}>
        <feature.icon className={cn('h-6 w-6', feature.color)} />
      </div>

      <h3 className="mb-2 text-xl font-semibold">
        <Trans i18nKey={`marketing:${feature.titleKey}`} />
      </h3>
      <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
        <Trans i18nKey={`marketing:${feature.descKey}`} />
      </p>

      {/* Different animation types */}
      {isVisible && feature.type === 'time-saved' && <TimeSavedAnimation metric={feature.metric} />}
      {isVisible && feature.type === 'chart' && <ChartAnimation metric={feature.metric} />}
      {isVisible && feature.type === 'workload' && <WorkloadAnimation metric={feature.metric} />}
      {isVisible && feature.type === 'efficiency' && <EfficiencyAnimation metric={feature.metric} />}
      {isVisible && feature.type === 'logos' && <LogosAnimation logos={feature.logos} />}
      {isVisible && feature.type === 'capacity' && <CapacityAnimation metric={feature.metric} />}

      {/* Hover effect */}
      <div className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className={cn('h-full w-full', feature.bgColor, 'opacity-5')} />
      </div>
    </Card>
  );
}

function TimeSavedAnimation({ metric }: { metric: any }) {
  const [hours, setHours] = useState(0);
  const { t } = useTranslation();

  useEffect(() => {
    let current = 0;
    const increment = metric.hours / 40;
    const timer = setInterval(() => {
      current += increment;
      if (current >= metric.hours) {
        setHours(metric.hours);
        clearInterval(timer);
      } else {
        setHours(Math.floor(current));
      }
    }, 40);

    return () => clearInterval(timer);
  }, [metric.hours]);

  return (
    <div className="bg-muted/30 mt-4 rounded-lg p-4">
      <div className="flex items-baseline justify-center gap-2">
        <div className="text-primary text-5xl font-bold">{hours}</div>
        <div className="text-muted-foreground text-lg">{t('marketing:hours')}</div>
      </div>
      <div className="text-muted-foreground mt-1 text-center text-xs">
        <Trans i18nKey={`marketing:${metric.labelKey}`} />
      </div>
      <div className="bg-primary/20 mt-3 h-2 overflow-hidden rounded-full">
        <div 
          className="bg-primary h-full transition-all duration-1000"
          style={{ width: `${(hours / metric.hours) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ChartAnimation({ metric }: { metric: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [revenue, setRevenue] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let progress = 0;
    let animationFrameId: number;
    const dataPoints = [0.2, 0.4, 0.35, 0.6, 0.5, 0.8, 0.75, 0.9, 1.0];
    const targetValue = 24800;
    
    const animate = () => {
      if (progress < 1) {
        progress += 0.015;
        setRevenue(Math.floor(targetValue * Math.min(progress, 1)));
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          const y = (canvas.height / 4) * i;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
        
        const visibleProgress = progress * progress * (3 - 2 * progress);
        const pointsToShow = dataPoints.length * visibleProgress;
        
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        
        let firstPoint = true;
        dataPoints.forEach((point, i) => {
          if (i <= pointsToShow) {
            const x = (canvas.width / (dataPoints.length - 1)) * i;
            const y = canvas.height - point * canvas.height * 0.85 - 8;
            
            if (firstPoint) {
              ctx.moveTo(x, y);
              firstPoint = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        
        ctx.stroke();
        
        if (pointsToShow > 0) {
          ctx.lineTo((canvas.width / (dataPoints.length - 1)) * Math.min(pointsToShow, dataPoints.length - 1), canvas.height);
          ctx.lineTo(0, canvas.height);
          ctx.closePath();
          
          const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
          gradient.addColorStop(0, 'rgba(34, 197, 94, 0.15)');
          gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
          ctx.fillStyle = gradient;
          ctx.fill();
        }
        
        animationFrameId = requestAnimationFrame(animate);
      }
    };
    
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div className="bg-muted/30 mt-4 rounded-lg p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-primary text-2xl font-bold">${revenue.toLocaleString()}</div>
        <div className="text-green-500 text-sm font-semibold">{metric.growth}</div>
      </div>
      <canvas ref={canvasRef} width={280} height={100} className="w-full" />
    </div>
  );
}

function LogosAnimation({ logos }: { logos: string[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % logos.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [logos.length]);

  return (
    <div className="bg-muted/30 mt-4 rounded-lg p-4">
      <div className="grid grid-cols-3 gap-2">
        {logos.slice(0, 6).map((logo, i) => (
          <div
            key={logo}
            className={cn(
              'bg-background flex h-12 items-center justify-center rounded border text-xs font-medium transition-all duration-300',
              i === activeIndex ? 'border-primary scale-105 shadow-md' : 'border-border/50',
            )}
            style={{
              animation: i === activeIndex ? 'bob 1s ease-in-out infinite' : 'none',
            }}
          >
            {logo}
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkloadAnimation({ metric }: { metric: any }) {
  const { t } = useTranslation();

  return (
    <div className="bg-muted/30 mt-4 rounded-lg p-4">
      <div className="mb-4 text-center">
        <div className="text-muted-foreground mb-2 text-xs">
          <Trans i18nKey="marketing:callDistribution" />
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-primary font-medium">
              <Trans i18nKey="marketing:handledByAI" />
            </span>
            <span className="text-primary font-bold">{metric.handled}%</span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div 
              className="bg-primary h-full transition-all duration-1000 ease-out"
              style={{ 
                width: `${metric.handled}%`,
                animation: 'slideIn 1s ease-out'
              }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              <Trans i18nKey="marketing:requiresStaff" />
            </span>
            <span className="font-bold">{metric.byStaff}%</span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div 
              className="bg-muted-foreground/40 h-full transition-all duration-1000 ease-out"
              style={{ 
                width: `${metric.byStaff}%`,
                animation: 'slideIn 1s ease-out 0.5s both'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EfficiencyAnimation({ metric }: { metric: any }) {
  const { t } = useTranslation();

  return (
    <div className="bg-muted/30 mt-4 rounded-lg p-4">
      <div className="flex items-center justify-center gap-4">
        <div className="text-center">
          <div className="bg-muted/50 mb-2 flex h-16 w-16 items-center justify-center rounded-full">
            <Users className="text-muted-foreground h-8 w-8" />
          </div>
          <div className="text-xs">
            <Trans i18nKey="marketing:before" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="text-primary text-2xl font-bold">→</div>
        </div>
        <div className="text-center">
          <div className="bg-primary/20 border-primary/50 mb-2 flex h-16 w-16 items-center justify-center rounded-full border-2">
            <div className="text-primary text-3xl font-bold">{metric.multiplier}</div>
          </div>
          <div className="text-primary text-xs font-semibold">
            <Trans i18nKey="marketing:after" />
          </div>
        </div>
      </div>
      <div className="text-muted-foreground mt-3 text-center text-xs">
        <Trans i18nKey={`marketing:${metric.labelKey}`} />
      </div>
    </div>
  );
}

function CapacityAnimation({ metric }: { metric: any }) {
  const [count, setCount] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (count < 2) {
        setCount(2);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [count]);

  return (
    <div className="bg-muted/30 mt-4 rounded-lg p-4 text-center">
      <div className="flex items-baseline justify-center gap-2">
        <div className="text-primary text-5xl font-bold transition-all duration-500">
          {count}x
        </div>
      </div>
      <div className="text-muted-foreground mt-1 text-xs">
        <Trans i18nKey={`marketing:${metric.labelKey}`} />
      </div>
      <div className="mt-3 flex justify-center gap-2">
        {[...Array(count)].map((_, i) => (
          <div
            key={i}
            className="bg-primary/60 h-3 w-3 rounded-full transition-all duration-500"
            style={{
              animation: `bob 2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

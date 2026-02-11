'use client';

import { useEffect, useRef, useState } from 'react';

export function NeuralWaveHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { 
      alpha: true,
      desynchronized: true,
    });
    if (!ctx) return;

    const updateSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    updateSize();

    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateSize, 150);
    };
    window.addEventListener('resize', handleResize);

    let animationFrame: number;
    let time = 0;
    const centerX = canvas.offsetWidth / 2;
    const centerY = canvas.offsetHeight / 2;

    // Audio bars configuration - like voice visualization
    const barCount = isMobile ? 40 : 80;
    const bars: AudioBar[] = [];
    const maxBarHeight = isMobile ? 120 : 200;
    const barWidth = isMobile ? 3 : 4;
    const barSpacing = isMobile ? 6 : 8;

    class AudioBar {
      index: number;
      x: number;
      baseHeight: number;
      height: number;
      speed: number;
      offset: number;
      hue: number;

      constructor(index: number, total: number) {
        this.index = index;
        this.x = centerX - (total * barSpacing) / 2 + index * barSpacing;
        this.baseHeight = 10 + Math.random() * 30;
        this.height = this.baseHeight;
        this.speed = 0.02 + Math.random() * 0.03;
        this.offset = Math.random() * Math.PI * 2;
        
        // Distance from center determines color
        const distFromCenter = Math.abs(index - total / 2) / (total / 2);
        this.hue = 200 + distFromCenter * 60; // Blue to purple gradient
      }

      update() {
        // Create voice-like amplitude modulation
        const wave1 = Math.sin(time * this.speed + this.offset) * 0.4;
        const wave2 = Math.sin(time * this.speed * 2 + this.offset) * 0.3;
        const wave3 = Math.cos(time * this.speed * 0.5) * 0.3;
        
        // Combine waves for natural voice-like movement
        const amplitude = (wave1 + wave2 + wave3) * maxBarHeight;
        this.height = this.baseHeight + Math.abs(amplitude);
      }

      draw() {
        const y = centerY;
        const alpha = 0.6 + Math.sin(time * this.speed * 2) * 0.2;
        
        // Draw bar with gradient
        const gradient = ctx.createLinearGradient(this.x, y - this.height / 2, this.x, y + this.height / 2);
        gradient.addColorStop(0, `hsla(${this.hue}, 70%, 60%, 0.1)`);
        gradient.addColorStop(0.5, `hsla(${this.hue}, 80%, 65%, ${alpha})`);
        gradient.addColorStop(1, `hsla(${this.hue}, 70%, 60%, 0.1)`);
        
        ctx.fillStyle = gradient;
        ctx.shadowBlur = 10;
        ctx.shadowColor = `hsla(${this.hue}, 80%, 60%, 0.4)`;
        
        // Draw rounded bar
        ctx.beginPath();
        ctx.roundRect(
          this.x - barWidth / 2,
          y - this.height / 2,
          barWidth,
          this.height,
          barWidth / 2
        );
        ctx.fill();
      }
    }

    // Initialize bars
    for (let i = 0; i < barCount; i++) {
      bars.push(new AudioBar(i, barCount));
    }

    // Particles for ambient effect
    const particles: Particle[] = [];
    const particleCount = isMobile ? 30 : 60;

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      hue: number;
      alpha: number;
      life: number;

      constructor() {
        this.x = Math.random() * canvas.offsetWidth;
        this.y = Math.random() * canvas.offsetHeight;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = 1 + Math.random() * 2;
        this.hue = 200 + Math.random() * 60;
        this.alpha = 0.3 + Math.random() * 0.4;
        this.life = 1;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.002;

        // Wrap around screen
        if (this.x < 0) this.x = canvas.offsetWidth;
        if (this.x > canvas.offsetWidth) this.x = 0;
        if (this.y < 0) this.y = canvas.offsetHeight;
        if (this.y > canvas.offsetHeight) this.y = 0;

        if (this.life <= 0) {
          this.x = Math.random() * canvas.offsetWidth;
          this.y = Math.random() * canvas.offsetHeight;
          this.life = 1;
        }
      }

      draw() {
        ctx.fillStyle = `hsla(${this.hue}, 70%, 60%, ${this.alpha * this.life})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    // Animation loop
    let lastTime = performance.now();
    const targetFPS = isMobile ? 30 : 60;
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      
      if (deltaTime < frameInterval) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }
      
      lastTime = currentTime - (deltaTime % frameInterval);
      time++;

      // Clear with transparency
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      // Draw ambient particles
      ctx.shadowBlur = 0;
      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });

      // Draw center glow
      const glowSize = 100 + Math.sin(time * 0.02) * 20;
      const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowSize);
      glow.addColorStop(0, 'rgba(100, 150, 255, 0.08)');
      glow.addColorStop(1, 'rgba(100, 150, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      // Draw audio bars
      ctx.shadowBlur = 10;
      bars.forEach((bar) => {
        bar.update();
        bar.draw();
      });

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
      cancelAnimationFrame(animationFrame);
    };
  }, [isMobile]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ 
        pointerEvents: 'none',
      }}
    />
  );
}

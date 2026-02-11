import { PrismaClient } from '@prisma/client';
import axios from 'axios';

/**
 * Sikka Writeback Tracking Service with Rate Limiting
 * 
 * RATE LIMIT: 200 API requests per practice per MINUTE (12,000/hour)
 * 
 * Strategy:
 * 1. Initial check after 10 seconds (give SPU time to process)
 * 2. Poll frequently for fast confirmation (every 10s)
 * 3. Exponential backoff for stuck operations
 * 4. Track API usage per practice per minute
 * 5. Reserve capacity for actual API operations (bookings, updates)
 */

const prisma = new PrismaClient();

interface WritebackStatus {
  id: string;
  result: 'pending' | 'completed' | 'failed';
  errorMessage?: string;
  completedTime?: string;
  durationInSeconds?: string;
}

interface RateLimitTracker {
  [pmsIntegrationId: string]: {
    requestCount: number;
    windowStart: Date;
    priority: 'high' | 'low';
  };
}

export class SikkaWritebackService {
  private readonly baseUrl = 'https://api.sikkasoft.com/v4';
  private rateLimits: RateLimitTracker = {};
  
  // Rate limit settings (per minute!)
  private readonly MAX_REQUESTS_PER_MINUTE = 200;
  private readonly SAFE_REQUESTS_PER_MINUTE = 150; // Leave 50 for actual API operations
  
  // Timing settings (much more aggressive with 200/min limit)
  private readonly INITIAL_CHECK_DELAY = 10; // Wait 10 seconds before first check
  private readonly POLLING_INTERVAL = 10; // Poll every 10 seconds
  private readonly MAX_CHECK_ATTEMPTS = 30; // Max attempts before giving up
  
  // Low traffic hours (e.g., midnight to 6 AM in practice timezone)
  private readonly LOW_TRAFFIC_HOURS = [0, 1, 2, 3, 4, 5];
  
  /**
   * Check if we're within rate limit for a practice
   */
  private canMakeRequest(pmsIntegrationId: string, priority: 'high' | 'low' = 'low'): boolean {
    const now = new Date();
    const tracker = this.rateLimits[pmsIntegrationId];
    
    if (!tracker) {
      // Initialize tracker
      this.rateLimits[pmsIntegrationId] = {
        requestCount: 0,
        windowStart: now,
        priority: priority,
      };
      return true;
    }
    
    // Reset window if more than 1 minute has passed
    const secondsSinceStart = (now.getTime() - tracker.windowStart.getTime()) / 1000;
    if (secondsSinceStart >= 60) {
      this.rateLimits[pmsIntegrationId] = {
        requestCount: 0,
        windowStart: now,
        priority: priority,
      };
      return true;
    }
    
    // For high priority requests (actual API operations), use full limit
    const limit = priority === 'high' ? this.MAX_REQUESTS_PER_MINUTE : this.SAFE_REQUESTS_PER_MINUTE;
    
    return tracker.requestCount < limit;
  }
  
  /**
   * Increment request counter
   */
  private incrementRequestCount(pmsIntegrationId: string) {
    if (this.rateLimits[pmsIntegrationId]) {
      this.rateLimits[pmsIntegrationId].requestCount++;
    }
  }
  
  /**
   * Check if it's low traffic time
   */
  private isLowTrafficTime(): boolean {
    const hour = new Date().getHours();
    return this.LOW_TRAFFIC_HOURS.includes(hour);
  }
  
  /**
   * Calculate next check time based on attempt count (exponential backoff)
   * With 200 req/min limit, we can be more aggressive
   */
  private calculateNextCheckTime(checkCount: number, submittedAt: Date): Date {
    const now = new Date();
    const ageInSeconds = (now.getTime() - submittedAt.getTime()) / 1000;
    
    // Don't check until initial delay has passed
    if (ageInSeconds < this.INITIAL_CHECK_DELAY) {
      return new Date(submittedAt.getTime() + this.INITIAL_CHECK_DELAY * 1000);
    }
    
    // Exponential backoff: 10s, 10s, 20s, 30s, 1m, 2m, 5m, 10m...
    // Much faster than before since we have 200 req/min
    const delays = [10, 10, 20, 30, 60, 120, 300, 600, 1800];
    const delaySeconds = delays[Math.min(checkCount, delays.length - 1)];
    
    return new Date(now.getTime() + delaySeconds * 1000);
  }
  
  /**
   * Check status of a single writeback operation
   */
  async checkWritebackStatus(writebackId: string, appId: string, appKey: string): Promise<WritebackStatus | null> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/writebacks`,
        {
          params: { id: writebackId },
          headers: {
            'App-Id': appId,
            'App-Key': appKey,
          },
          timeout: 10000,
        }
      );
      
      const writebacks = response.data.items || [];
      if (writebacks.length === 0) {
        return null;
      }
      
      const writeback = writebacks[0];
      
      return {
        id: writeback.id,
        result: writeback.result,
        errorMessage: writeback.error_message,
        completedTime: writeback.completed_time,
        durationInSeconds: writeback.duration_in_second,
      };
      
    } catch (error) {
      console.error(`[Writeback] Error checking status for ${writebackId}:`, error);
      return null;
    }
  }
  
  /**
   * Update writeback status in database
   */
  async updateWritebackStatus(writebackId: string, status: WritebackStatus): Promise<void> {
    await prisma.pmsWriteback.update({
      where: { id: writebackId },
      data: {
        result: status.result,
        errorMessage: status.errorMessage,
        completedAt: status.completedTime ? new Date(status.completedTime) : undefined,
        lastCheckedAt: new Date(),
        checkCount: {
          increment: 1,
        },
      },
    });
  }
  
  /**
   * Get writebacks that are ready to be checked (respecting timing and rate limits)
   */
  private async getWritebacksReadyForCheck(): Promise<Array<any>> {
    const now = new Date();
    
    // Get pending writebacks that haven't exceeded max attempts
    const allPending = await prisma.pmsWriteback.findMany({
      where: {
        result: 'pending',
        checkCount: { lt: this.MAX_CHECK_ATTEMPTS },
      },
      include: {
        pmsIntegration: true,
      },
      orderBy: {
        submittedAt: 'asc',
      },
    });
    
    // Filter based on timing and rate limits
    const readyForCheck = [];
    
    for (const writeback of allPending) {
      const pmsIntegrationId = writeback.pmsIntegrationId;
      
      // Calculate when this writeback should be checked next
      const nextCheckTime = this.calculateNextCheckTime(
        writeback.checkCount,
        writeback.submittedAt
      );
      
      // Skip if not yet time to check
      if (now < nextCheckTime) {
        continue;
      }
      
      // Skip if we've hit rate limit for this practice
      if (!this.canMakeRequest(pmsIntegrationId, 'low')) {
        console.log(`[Writeback] Rate limit reached for ${pmsIntegrationId}, skipping ${writeback.id}`);
        continue;
      }
      
      readyForCheck.push(writeback);
    }
    
    // During low traffic, prioritize older writebacks
    if (this.isLowTrafficTime()) {
      return readyForCheck; // Check all ready
    } else {
      // During high traffic, still check many (we have 150/min available)
      // Can handle ~15 writebacks per 10-second polling cycle
      return readyForCheck.slice(0, 15);
    }
  }
  
  /**
   * Poll pending writebacks (smart rate-limited version)
   */
  async pollPendingWritebacks(): Promise<{ 
    checked: number; 
    updated: number; 
    skipped: number;
    rateLimited: number;
  }> {
    const isLowTraffic = this.isLowTrafficTime();
    console.log(`[Writeback] Polling (${isLowTraffic ? 'LOW' : 'HIGH'} traffic period)...`);
    
    const readyForCheck = await this.getWritebacksReadyForCheck();
    
    console.log(`[Writeback] Found ${readyForCheck.length} writeback(s) ready for check`);
    
    let checked = 0;
    let updated = 0;
    let rateLimited = 0;
    
    for (const writeback of readyForCheck) {
      const credentials = writeback.pmsIntegration.credentials as any;
      const appId = credentials.appId;
      const appKey = credentials.appKey;
      const pmsIntegrationId = writeback.pmsIntegrationId;
      
      if (!appId || !appKey) {
        console.warn(`[Writeback] Missing credentials for ${writeback.id}`);
        continue;
      }
      
      // Double-check rate limit before making request
      if (!this.canMakeRequest(pmsIntegrationId, 'low')) {
        rateLimited++;
        continue;
      }
      
      const status = await this.checkWritebackStatus(writeback.id, appId, appKey);
      this.incrementRequestCount(pmsIntegrationId);
      checked++;
      
      if (status && status.result !== 'pending') {
        await this.updateWritebackStatus(writeback.id, status);
        updated++;
        
        console.log(`[Writeback] ${writeback.id}: ${status.result} (after ${writeback.checkCount + 1} checks)`);
      } else {
        // Update last checked time even if still pending
        await prisma.pmsWriteback.update({
          where: { id: writeback.id },
          data: {
            lastCheckedAt: new Date(),
            checkCount: { increment: 1 },
          },
        });
      }
      
      // Small delay between checks to avoid bursting (50ms with 200/min is safe)
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Get count of pending writebacks not ready yet
    const totalPending = await prisma.pmsWriteback.count({
      where: { result: 'pending' },
    });
    const skipped = totalPending - checked;
    
    console.log(`[Writeback] Checked ${checked}, updated ${updated}, skipped ${skipped}, rate-limited ${rateLimited}`);
    
    return { checked, updated, skipped, rateLimited };
  }
  
  /**
   * Get writeback statistics per practice
   */
  async getWritebackStatsByPractice(pmsIntegrationId: string) {
    const [total, pending, completed, failed, avgDuration] = await Promise.all([
      prisma.pmsWriteback.count({ 
        where: { pmsIntegrationId } 
      }),
      prisma.pmsWriteback.count({ 
        where: { pmsIntegrationId, result: 'pending' } 
      }),
      prisma.pmsWriteback.count({ 
        where: { pmsIntegrationId, result: 'completed' } 
      }),
      prisma.pmsWriteback.count({ 
        where: { pmsIntegrationId, result: 'failed' } 
      }),
      prisma.$queryRaw<Array<{ avg_duration: number }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (completed_at - submitted_at))) as avg_duration
        FROM pms_writebacks
        WHERE pms_integration_id = ${pmsIntegrationId}
          AND result = 'completed'
          AND completed_at IS NOT NULL
      `,
    ]);
    
    // Get current rate limit status
    const rateLimitInfo = this.rateLimits[pmsIntegrationId];
    const requestsRemaining = rateLimitInfo 
      ? this.SAFE_REQUESTS_PER_MINUTE - rateLimitInfo.requestCount
      : this.SAFE_REQUESTS_PER_MINUTE;
    
    return {
      total,
      pending,
      completed,
      failed,
      successRate: total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0',
      avgDurationSeconds: avgDuration[0]?.avg_duration || 0,
      rateLimitStatus: {
        requestsUsed: rateLimitInfo?.requestCount || 0,
        requestsRemaining,
        windowStart: rateLimitInfo?.windowStart,
      },
    };
  }
  
  /**
   * Mark very old stuck writebacks as failed (>6 hours)
   * With 200/min we check frequently, so 6 hours is generous
   */
  async markStuckWritebacksAsFailed(): Promise<number> {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    
    const result = await prisma.pmsWriteback.updateMany({
      where: {
        result: 'pending',
        submittedAt: { lt: sixHoursAgo },
      },
      data: {
        result: 'failed',
        errorMessage: 'Writeback timeout - operation stuck in pending state for >6 hours',
        completedAt: new Date(),
      },
    });
    
    if (result.count > 0) {
      console.log(`[Writeback] Marked ${result.count} stuck writeback(s) as failed`);
    }
    
    return result.count;
  }
  
  /**
   * Retry failed writebacks during low traffic (can be run manually or scheduled)
   */
  async retryFailedWritebacks(maxRetries: number = 10): Promise<{ 
    retried: number; 
    successful: number; 
  }> {
    if (!this.isLowTrafficTime()) {
      console.log('[Writeback] Not in low-traffic period, skipping retry');
      return { retried: 0, successful: 0 };
    }
    
    console.log('[Writeback] Retrying failed writebacks during low-traffic period...');
    
    // Get failed writebacks that might be worth retrying
    const failedWritebacks = await prisma.pmsWriteback.findMany({
      where: {
        result: 'failed',
        checkCount: { lt: this.MAX_CHECK_ATTEMPTS },
        // Only retry if failed within last 7 days
        completedAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: {
        pmsIntegration: true,
      },
      take: maxRetries,
    });
    
    let retried = 0;
    let successful = 0;
    
    for (const writeback of failedWritebacks) {
      const credentials = writeback.pmsIntegration.credentials as any;
      
      if (!this.canMakeRequest(writeback.pmsIntegrationId, 'low')) {
        continue;
      }
      
      const status = await this.checkWritebackStatus(
        writeback.id,
        credentials.appId,
        credentials.appKey
      );
      
      this.incrementRequestCount(writeback.pmsIntegrationId);
      retried++;
      
      if (status && status.result === 'completed') {
        await this.updateWritebackStatus(writeback.id, status);
        successful++;
        console.log(`[Writeback] Retry successful for ${writeback.id}`);
      }
    }
    
    console.log(`[Writeback] Retry complete: ${retried} retried, ${successful} successful`);
    
    return { retried, successful };
  }
  
  /**
   * Get API usage report for monitoring
   */
  async getApiUsageReport(): Promise<Array<{
    pmsIntegrationId: string;
    officeName: string;
    requestsUsed: number;
    requestsRemaining: number;
    percentUsed: number;
    windowStart: Date;
  }>> {
    const report = [];
    
    for (const [pmsIntegrationId, tracker] of Object.entries(this.rateLimits)) {
      const integration = await prisma.pmsIntegration.findUnique({
        where: { id: pmsIntegrationId },
      });
      
      if (!integration) continue;
      
      const metadata = integration.metadata as any;
      
      report.push({
        pmsIntegrationId,
        officeName: metadata?.practiceName || 'Unknown',
        requestsUsed: tracker.requestCount,
        requestsRemaining: this.SAFE_REQUESTS_PER_MINUTE - tracker.requestCount,
        percentUsed: (tracker.requestCount / this.SAFE_REQUESTS_PER_MINUTE) * 100,
        windowStart: tracker.windowStart,
      });
    }
    
    return report;
  }
}

/**
 * Standalone function for scheduled job (runs every 10 seconds)
 */
export async function pollSikkaWritebacks() {
  const service = new SikkaWritebackService();
  
  // Mark very old stuck writebacks as failed
  await service.markStuckWritebacksAsFailed();
  
  // Poll pending writebacks with rate limiting
  return await service.pollPendingWritebacks();
}

/**
 * Standalone function for low-traffic retry (runs during off-hours)
 */
export async function retrySikkaWritebacks() {
  const service = new SikkaWritebackService();
  return await service.retryFailedWritebacks();
}

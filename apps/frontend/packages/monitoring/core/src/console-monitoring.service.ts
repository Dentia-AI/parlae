import { MonitoringService } from '@kit/monitoring-core';

export class ConsoleMonitoringService implements MonitoringService {
  identifyUser(_data: { id: string }) {
    // Silenced in production to avoid leaking user IDs/emails to browser console
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Console Monitoring] Identified user`, _data.id);
    }
  }

  captureException(error: Error) {
    console.error(
      `[Console Monitoring] Caught exception: ${error?.message || 'Unknown error'}`,
    );
  }

  captureEvent(event: string) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Console Monitoring] Captured event: ${event}`);
    }
  }

  ready() {
    return Promise.resolve();
  }
}

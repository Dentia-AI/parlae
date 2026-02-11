'use server';

import { prisma } from '@kit/prisma';
import { revalidatePath } from 'next/cache';
import { auth } from '@kit/shared/auth/nextauth';

/**
 * Server Actions for setup progress tracking
 * Server Actions bypass NextAuth CSRF issues while maintaining security
 * through automatic authentication checks
 */

export interface VoiceSetupData {
  voiceId: string;
  name: string;
  provider: string;
  gender: string;
  accent: string;
  description?: string;
}

export interface KnowledgeBaseFile {
  id: string;
  name: string;
  size?: number;
}

export interface IntegrationsData {
  pmsProvider?: string | null;
  pmsConnectionId?: string;
  pmsConnected?: boolean;
  pmsSettings?: Record<string, any>;
  googleCalendarConnected?: boolean;
  googleCalendarEmail?: string | null;
  skipped?: boolean;
}

export interface PhoneIntegrationData {
  method: string;
  settings?: Record<string, any>;
}

/**
 * Get current setup progress
 */
export async function getSetupProgressAction(accountId: string) {
  try {
    // Verify user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        setupProgress: true,
        setupLastStep: true,
        setupCompletedAt: true,
      },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    return {
      success: true,
      data: {
        accountId,
        progress: (account.setupProgress as any) || {},
        lastStep: account.setupLastStep,
        completedAt: account.setupCompletedAt,
      },
    };
  } catch (error) {
    console.error('[Setup Actions] Get progress error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch setup progress',
    };
  }
}

/**
 * Save voice selection
 */
export async function saveVoiceProgressAction(accountId: string, voice: VoiceSetupData) {
  try {
    // Verify user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    // Validate that voice data exists
    if (!voice?.voiceId) {
      return {
        success: false,
        error: 'No voice selected',
      };
    }

    console.log('[Setup Actions] Saving voice progress:', { accountId, voice });

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { setupProgress: true },
    });

    const currentProgress = (account?.setupProgress as any) || {};
    const updatedProgress = {
      ...currentProgress,
      voice: {
        data: voice,
        completedAt: new Date().toISOString(),
      },
    };

    await prisma.account.update({
      where: { id: accountId },
      data: {
        setupProgress: updatedProgress,
        setupLastStep: 'voice',
        updatedAt: new Date(),
      },
    });

    revalidatePath('/home/agent/setup');

    console.log('[Setup Actions] Voice progress saved successfully');

    return { success: true };
  } catch (error) {
    console.error('[Setup Actions] Save voice error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save voice progress',
    };
  }
}

/**
 * Save knowledge base progress
 */
export async function saveKnowledgeProgressAction(accountId: string, files: KnowledgeBaseFile[]) {
  try {
    // Verify user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    // Only save if there are files
    if (!files || files.length === 0) {
      console.log('[Setup Actions] Skipping knowledge base save - no files provided');
      return { success: true }; // Success but no save needed
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { setupProgress: true },
    });

    const currentProgress = (account?.setupProgress as any) || {};
    const updatedProgress = {
      ...currentProgress,
      knowledge: {
        data: { files },
        completedAt: new Date().toISOString(),
      },
    };

    await prisma.account.update({
      where: { id: accountId },
      data: {
        setupProgress: updatedProgress,
        setupLastStep: 'knowledge',
        updatedAt: new Date(),
      },
    });

    revalidatePath('/home/agent/setup');

    console.log('[Setup Actions] Knowledge base progress saved successfully');

    return { success: true };
  } catch (error) {
    console.error('[Setup Actions] Save knowledge error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save knowledge progress',
    };
  }
}

/**
 * Save integrations progress
 */
export async function saveIntegrationsProgressAction(accountId: string, data: IntegrationsData) {
  try {
    // Verify user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    // Only save if there's integration data or if they explicitly skipped
    const hasData = data?.pmsProvider || data?.pmsConnectionId || Object.keys(data || {}).length > 0;
    if (!hasData) {
      console.log('[Setup Actions] Skipping integrations save - no data provided');
      return { success: true }; // Success but no save needed
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { setupProgress: true },
    });

    const currentProgress = (account?.setupProgress as any) || {};
    const updatedProgress = {
      ...currentProgress,
      integrations: {
        data,
        completedAt: new Date().toISOString(),
      },
    };

    await prisma.account.update({
      where: { id: accountId },
      data: {
        setupProgress: updatedProgress,
        setupLastStep: 'integrations',
        updatedAt: new Date(),
      },
    });

    revalidatePath('/home/agent/setup');

    console.log('[Setup Actions] Integrations progress saved successfully');

    return { success: true };
  } catch (error) {
    console.error('[Setup Actions] Save integrations error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save integrations progress',
    };
  }
}

/**
 * Save phone integration progress
 */
export async function savePhoneProgressAction(accountId: string, data: PhoneIntegrationData) {
  try {
    // Verify user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    // Validate that method is selected
    if (!data?.method) {
      return {
        success: false,
        error: 'No phone integration method selected',
      };
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { setupProgress: true },
    });

    const currentProgress = (account?.setupProgress as any) || {};
    const updatedProgress = {
      ...currentProgress,
      phone: {
        data,
        completedAt: new Date().toISOString(),
      },
    };

    await prisma.account.update({
      where: { id: accountId },
      data: {
        setupProgress: updatedProgress,
        setupLastStep: 'phone',
        updatedAt: new Date(),
      },
    });

    revalidatePath('/home/agent/setup');

    console.log('[Setup Actions] Phone integration progress saved successfully');

    return { success: true };
  } catch (error) {
    console.error('[Setup Actions] Save phone error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save phone progress',
    };
  }
}

/**
 * Clear setup progress
 */
export async function clearSetupProgressAction(accountId: string) {
  try {
    // Verify user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    await prisma.account.update({
      where: { id: accountId },
      data: {
        setupProgress: {},
        setupLastStep: null,
        setupCompletedAt: null,
      },
    });

    revalidatePath('/home/agent/setup');

    return { success: true };
  } catch (error) {
    console.error('[Setup Actions] Clear progress error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear setup progress',
    };
  }
}

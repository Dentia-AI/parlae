'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSetupProgressAction,
  saveVoiceProgressAction,
  saveKnowledgeProgressAction,
  saveIntegrationsProgressAction,
  savePhoneProgressAction,
  type VoiceSetupData,
  type KnowledgeBaseFile,
  type KnowledgeBaseCategoryData,
  type IntegrationsData,
  type PhoneIntegrationData,
} from '../_actions/setup-progress-actions';

// Type for the progress response
export interface SetupProgressResponse {
  progress: {
    voice?: {
      data: VoiceSetupData;
      completedAt: string;
    };
    knowledge?: {
      data: {
        files: KnowledgeBaseFile[];
      };
      completedAt: string;
    };
    integrations?: {
      data: IntegrationsData;
      completedAt: string;
    };
    phone?: {
      data: PhoneIntegrationData;
      completedAt: string;
    };
  };
  lastStep: string | null;
  completedAt: string | null;
}

/**
 * Hook to manage setup progress
 */
export function useSetupProgress(accountId: string) {
  const queryClient = useQueryClient();

  // Fetch current progress
  const {
    data: progressData,
    isLoading,
    error,
  } = useQuery<SetupProgressResponse>({
    queryKey: ['setup-progress', accountId],
    queryFn: async () => {
      const result = await getSetupProgressAction(accountId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch setup progress');
      }
      return result.data as SetupProgressResponse;
    },
    enabled: !!accountId,
  });

  // Save voice progress mutation
  const saveVoiceMutation = useMutation({
    mutationFn: async (voice: VoiceSetupData) => {
      const result = await saveVoiceProgressAction(accountId, voice);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save voice progress');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-progress', accountId] });
    },
  });

  // Save knowledge progress mutation (supports both flat and categorized)
  const saveKnowledgeMutation = useMutation({
    mutationFn: async (args: KnowledgeBaseFile[] | { files: KnowledgeBaseFile[]; categorizedFiles?: KnowledgeBaseCategoryData }) => {
      let files: KnowledgeBaseFile[];
      let categorizedFiles: KnowledgeBaseCategoryData | undefined;

      if (Array.isArray(args)) {
        files = args;
      } else {
        files = args.files;
        categorizedFiles = args.categorizedFiles;
      }

      const result = await saveKnowledgeProgressAction(accountId, files, categorizedFiles);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save knowledge progress');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-progress', accountId] });
    },
  });

  // Save integrations progress mutation
  const saveIntegrationsMutation = useMutation({
    mutationFn: async (data: IntegrationsData) => {
      const result = await saveIntegrationsProgressAction(accountId, data);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save integrations progress');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-progress', accountId] });
    },
  });

  // Save phone progress mutation
  const savePhoneMutation = useMutation({
    mutationFn: async (data: PhoneIntegrationData) => {
      const result = await savePhoneProgressAction(accountId, data);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save phone progress');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-progress', accountId] });
    },
  });

  // Mark review complete mutation
  const markReviewCompleteMutation = useMutation({
    mutationFn: () => markReviewComplete(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-progress', accountId] });
    },
  });

  // Mark setup complete mutation
  const markSetupCompleteMutation = useMutation({
    mutationFn: () => markSetupComplete(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-progress', accountId] });
    },
  });

  return {
    progress: progressData?.progress || {},
    lastStep: progressData?.lastStep,
    completedAt: progressData?.completedAt,
    isLoading,
    error,
    saveVoice: saveVoiceMutation.mutateAsync,
    saveKnowledge: saveKnowledgeMutation.mutateAsync,
    saveIntegrations: saveIntegrationsMutation.mutateAsync,
    savePhone: savePhoneMutation.mutateAsync,
    markReviewComplete: markReviewCompleteMutation.mutateAsync,
    markSetupComplete: markSetupCompleteMutation.mutateAsync,
    isSaving:
      saveVoiceMutation.isPending ||
      saveKnowledgeMutation.isPending ||
      saveIntegrationsMutation.isPending ||
      savePhoneMutation.isPending ||
      markReviewCompleteMutation.isPending ||
      markSetupCompleteMutation.isPending,
  };
}

/**
 * Hook to sync setup progress with sessionStorage
 * This loads saved progress from DB on mount and keeps sessionStorage in sync
 */
export function useSyncSetupProgress(accountId: string) {
  const { progress, isLoading } = useSetupProgress(accountId);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!isLoading && progress && !synced) {
      // Load progress from database and sync to sessionStorage
      if (progress.voice) {
        sessionStorage.setItem(
          'selectedVoice',
          JSON.stringify(progress.voice.data),
        );
      }

      if (progress.knowledge) {
        sessionStorage.setItem(
          'knowledgeBaseFiles',
          JSON.stringify(progress.knowledge.data.files),
        );
      }

      if (progress.phone) {
        sessionStorage.setItem(
          'phoneIntegrationMethod',
          progress.phone.data.method,
        );
        if (progress.phone.data.settings) {
          sessionStorage.setItem(
            'phoneIntegrationSettings',
            JSON.stringify(progress.phone.data.settings),
          );
        }
      }

      setSynced(true);
    }
  }, [progress, isLoading, synced]);

  return { synced, isLoading };
}

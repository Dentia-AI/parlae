import { Injectable, Logger } from '@nestjs/common';
import { ActionItemReason } from '@kit/prisma';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateActionItemParams {
  accountId: string;
  callId: string;
  provider: 'RETELL';
  direction: 'INBOUND' | 'OUTBOUND';
  analysis: Record<string, any>;
  contactName?: string;
  contactPhone?: string;
  summary?: string;
  campaignId?: string;
  callType?: string;
  disconnectionReason?: string;
}

const REASON_LABELS: Record<string, string> = {
  FOLLOW_UP_REQUIRED: 'Follow-up required',
  TRANSFER_FAILED: 'Transfer failed',
  NO_RESOLUTION: 'No resolution',
  EMERGENCY: 'Emergency handled',
  CALLER_HUNG_UP: 'Caller hung up',
  CALL_ERROR: 'Call error',
  VOICEMAIL_REVIEW: 'Voicemail needs review',
};

@Injectable()
export class ActionItemService {
  private readonly logger = new Logger(ActionItemService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates post-call analysis and creates an ActionItem + notification
   * if any trigger condition is met. Returns the created item or null.
   */
  async createActionItemIfNeeded(
    params: CreateActionItemParams,
  ): Promise<any | null> {
    const reason = this.detectReason(params);
    if (!reason) return null;

    const existing = await this.prisma.actionItem.findFirst({
      where: { callId: params.callId, accountId: params.accountId },
    });
    if (existing) return existing;

    try {
      const agentNotes = this.extractAgentNotes(params.analysis);

      const actionItem = await this.prisma.actionItem.create({
        data: {
          accountId: params.accountId,
          callId: params.callId,
          provider: params.provider,
          direction: params.direction,
          reason,
          contactName: params.contactName || null,
          contactPhone: params.contactPhone || null,
          summary: params.summary || params.analysis?.call_summary || null,
          agentNotes,
          campaignId: params.campaignId || null,
          callType: params.callType || null,
        },
      });

      await this.createNotification(
        params.accountId,
        params.contactName || params.contactPhone || 'a patient',
        reason,
        actionItem.id,
      );

      this.logger.log(
        `[ActionItem] Created action item | id=${actionItem.id} | callId=${params.callId} | reason=${reason} | direction=${params.direction}`,
      );

      return actionItem;
    } catch (err) {
      this.logger.error({
        callId: params.callId,
        err: err instanceof Error ? err.message : err,
        msg: '[ActionItem] Failed to create action item',
      });
      return null;
    }
  }

  private detectReason(
    params: CreateActionItemParams,
  ): ActionItemReason | null {
    const analysis = params.analysis || {};
    const customData = analysis.custom_analysis_data || analysis;

    if (
      customData.follow_up_required === true ||
      customData.follow_up_required === 'true' ||
      customData.followUpRequired === true
    ) {
      return ActionItemReason.FOLLOW_UP_REQUIRED;
    }

    if (
      customData.transferred_to_staff === true ||
      customData.transferred_to_staff === 'true' ||
      customData.transferredToStaff === true
    ) {
      return ActionItemReason.TRANSFER_FAILED;
    }

    const outcome = (
      customData.call_outcome ||
      customData.callOutcome ||
      ''
    ).toLowerCase();

    if (outcome === 'no_resolution' || outcome === 'noresolution') {
      return ActionItemReason.NO_RESOLUTION;
    }
    if (outcome === 'emergency_handled' || outcome === 'emergency') {
      return ActionItemReason.EMERGENCY;
    }
    if (outcome === 'caller_hung_up' || outcome === 'hungup') {
      return ActionItemReason.CALLER_HUNG_UP;
    }

    const disconnection = (
      params.disconnectionReason || ''
    ).toLowerCase();
    if (
      disconnection === 'machine_detected' ||
      disconnection === 'dial_failed' ||
      disconnection === 'error_inbound_webhook' ||
      disconnection === 'error_llm_websocket_open'
    ) {
      return ActionItemReason.CALL_ERROR;
    }

    if (disconnection === 'voicemail_reached') {
      return ActionItemReason.VOICEMAIL_REVIEW;
    }

    return null;
  }

  private extractAgentNotes(analysis: Record<string, any>): string | null {
    const customData = analysis?.custom_analysis_data || analysis || {};
    const notes: string[] = [];

    if (customData.agent_notes) notes.push(customData.agent_notes);
    if (customData.agentNotes) notes.push(customData.agentNotes);
    if (customData.callback_reason) notes.push(`Callback reason: ${customData.callback_reason}`);
    if (customData.callbackReason) notes.push(`Callback reason: ${customData.callbackReason}`);

    return notes.length > 0 ? notes.join('\n') : null;
  }

  private async createNotification(
    accountId: string,
    contactIdentifier: string,
    reason: string,
    actionItemId: string,
  ): Promise<void> {
    try {
      const reasonLabel = REASON_LABELS[reason] || reason;
      await this.prisma.notification.create({
        data: {
          accountId,
          body: `A call with ${contactIdentifier} needs your attention: ${reasonLabel}`,
          type: 'WARNING',
          channel: 'IN_APP',
          link: `/home/action-items?ref=${actionItemId}`,
        },
      });
    } catch (err) {
      this.logger.error({
        accountId,
        err: err instanceof Error ? err.message : err,
        msg: '[ActionItem] Failed to create notification',
      });
    }
  }
}

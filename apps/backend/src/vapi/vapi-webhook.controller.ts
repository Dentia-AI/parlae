import { Controller, Post, Body, Headers, Logger } from '@nestjs/common';

@Controller('vapi')
export class VapiWebhookController {
  private readonly logger = new Logger(VapiWebhookController.name);

  /**
   * POST /api/vapi/webhook
   * 
   * Receives webhooks from Vapi for call events:
   * - assistant-request: When a call starts
   * - status-update: Call status changes  
   * - end-of-call-report: Full transcript, recording, extracted data
   * - function-call: When AI wants to execute a function
   */
  @Post('webhook')
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-vapi-signature') signature: string,
  ) {
    this.logger.log(`[Vapi Webhook] Received: ${payload?.message?.type}`);

    // TODO: Verify signature with VAPI_SERVER_SECRET
    // const secret = process.env.VAPI_SERVER_SECRET;
    // if (secret && signature) {
    //   const isValid = this.verifySignature(payload, signature, secret);
    //   if (!isValid) {
    //     throw new UnauthorizedException('Invalid signature');
    //   }
    // }

    const messageType = payload?.message?.type;
    const callId = payload?.message?.call?.id;

    this.logger.log(`Processing webhook - Type: ${messageType}, Call ID: ${callId}`);

    switch (messageType) {
      case 'assistant-request':
        return this.handleAssistantRequest(payload);
      
      case 'status-update':
        return this.handleStatusUpdate(payload);
      
      case 'end-of-call-report':
        return this.handleEndOfCall(payload);
      
      case 'function-call':
        return this.handleFunctionCall(payload);
      
      default:
        this.logger.warn(`Unknown webhook type: ${messageType}`);
        return { received: true };
    }
  }

  private async handleAssistantRequest(payload: any) {
    this.logger.log('Handling assistant-request');
    // Return assistant config if needed
    return { received: true };
  }

  private async handleStatusUpdate(payload: any) {
    this.logger.log('Handling status-update');
    // Update call status in database
    return { received: true };
  }

  private async handleEndOfCall(payload: any) {
    this.logger.log('Handling end-of-call-report');
    // Save transcript, recording, analytics
    // TODO: Save to call_logs table
    return { received: true };
  }

  private async handleFunctionCall(payload: any) {
    this.logger.log('Handling function-call');
    // Execute custom function
    return { received: true };
  }
}

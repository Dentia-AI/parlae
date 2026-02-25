import { Controller, Post, Param, Body, Headers, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AgentToolsService } from '../agent-tools/agent-tools.service';

/**
 * Vapi Tools Controller
 * 
 * Handles tool calls from the Vapi webhook. Two routing patterns:
 * 
 * 1. Named routes (e.g., POST /vapi/tools/book-appointment)
 *    - Used by the backend directly
 * 
 * 2. Dynamic route (POST /vapi/tools/:toolName)
 *    - Used by the frontend webhook dispatcher
 *    - Maps camelCase tool names to service methods
 * 
 * Tool names match Sikka PMS API:
 * searchPatients, getPatientInfo, createPatient, updatePatient,
 * checkAvailability, bookAppointment, rescheduleAppointment,
 * cancelAppointment, getAppointments, addPatientNote,
 * getPatientInsurance, getPatientBalance, getProviders
 */
@Controller('vapi/tools')
export class VapiToolsController {
  private readonly logger = new Logger(VapiToolsController.name);

  constructor(private readonly agentToolsService: AgentToolsService) {}

  // ============================================================================
  // Dynamic route - dispatches any tool name to the matching service method
  // This is the primary route used by the frontend webhook
  // ============================================================================

  @Post(':toolName')
  async handleToolCall(
    @Param('toolName') toolName: string,
    @Body() body: any,
    @Headers('x-vapi-secret') vapiSecret: string,
    @Headers('authorization') authorization: string,
  ) {
    this.verifyAuth(vapiSecret, authorization);
    this.logger.log({ toolName }, `Tool call: ${toolName}`);

    // Map tool names to service methods
    const toolMap: Record<string, (payload: any) => Promise<any>> = {
      // Patient management
      'searchPatients': (p) => this.agentToolsService.searchPatients(p),
      'search-patients': (p) => this.agentToolsService.searchPatients(p),
      'getPatientInfo': (p) => this.agentToolsService.getPatientInfo(p),
      'get-patient-info': (p) => this.agentToolsService.getPatientInfo(p),
      'createPatient': (p) => this.agentToolsService.createPatient(p),
      'create-patient': (p) => this.agentToolsService.createPatient(p),
      'updatePatient': (p) => this.agentToolsService.updatePatient(p),
      'update-patient': (p) => this.agentToolsService.updatePatient(p),

      // Appointment management
      'checkAvailability': (p) => this.agentToolsService.checkAvailability(p),
      'check-availability': (p) => this.agentToolsService.checkAvailability(p),
      'bookAppointment': (p) => this.agentToolsService.bookAppointment(p),
      'book-appointment': (p) => this.agentToolsService.bookAppointment(p),
      'rescheduleAppointment': (p) => this.agentToolsService.rescheduleAppointment(p),
      'reschedule-appointment': (p) => this.agentToolsService.rescheduleAppointment(p),
      'cancelAppointment': (p) => this.agentToolsService.cancelAppointment(p),
      'cancel-appointment': (p) => this.agentToolsService.cancelAppointment(p),
      'getAppointments': (p) => this.agentToolsService.getAppointments(p),
      'get-appointments': (p) => this.agentToolsService.getAppointments(p),

      // Notes
      'addPatientNote': (p) => this.agentToolsService.addPatientNote(p),
      'add-patient-note': (p) => this.agentToolsService.addPatientNote(p),

      // Insurance & billing
      'getPatientInsurance': (p) => this.agentToolsService.getPatientInsurance(p),
      'get-patient-insurance': (p) => this.agentToolsService.getPatientInsurance(p),
      'getPatientBalance': (p) => this.agentToolsService.getPatientBalance(p),
      'get-patient-balance': (p) => this.agentToolsService.getPatientBalance(p),

      // Providers
      'getProviders': (p) => this.agentToolsService.getProviders(p),
      'get-providers': (p) => this.agentToolsService.getProviders(p),

      // Call transfer
      'transferToHuman': (p) => this.agentToolsService.transferToHuman(p),
      'transfer-to-human': (p) => this.agentToolsService.transferToHuman(p),
    };

    const handler = toolMap[toolName];
    if (!handler) {
      this.logger.warn({ toolName }, `Unknown tool: ${toolName}`);
      throw new HttpException(
        { error: `Unknown tool: ${toolName}`, message: 'This function is not available.' },
        HttpStatus.NOT_FOUND,
      );
    }

    return handler(body);
  }

  // ============================================================================
  // Auth verification
  // Accepts either x-vapi-secret header (from Vapi) or Bearer token (from frontend)
  // ============================================================================

  private verifyAuth(signature?: string, authorization?: string) {
    const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;
    const apiKey = process.env.BACKEND_API_KEY;

    // Check Vapi webhook signature
    if (signature && webhookSecret && signature === webhookSecret) {
      return;
    }

    // Check Bearer token (used by frontend webhook dispatcher)
    if (authorization) {
      const token = authorization.replace('Bearer ', '');
      if (apiKey && token === apiKey) {
        return;
      }
    }

    this.logger.error('Invalid authentication for tool call');
    throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  }
}

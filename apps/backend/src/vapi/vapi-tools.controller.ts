import { Controller, Post, Param, Body, Headers, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { VapiToolsService } from './vapi-tools.service';

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

  constructor(private readonly vapiToolsService: VapiToolsService) {}

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
      'searchPatients': (p) => this.vapiToolsService.searchPatients(p),
      'search-patients': (p) => this.vapiToolsService.searchPatients(p),
      'getPatientInfo': (p) => this.vapiToolsService.getPatientInfo(p),
      'get-patient-info': (p) => this.vapiToolsService.getPatientInfo(p),
      'createPatient': (p) => this.vapiToolsService.createPatient(p),
      'create-patient': (p) => this.vapiToolsService.createPatient(p),
      'updatePatient': (p) => this.vapiToolsService.updatePatient(p),
      'update-patient': (p) => this.vapiToolsService.updatePatient(p),

      // Appointment management
      'checkAvailability': (p) => this.vapiToolsService.checkAvailability(p),
      'check-availability': (p) => this.vapiToolsService.checkAvailability(p),
      'bookAppointment': (p) => this.vapiToolsService.bookAppointment(p),
      'book-appointment': (p) => this.vapiToolsService.bookAppointment(p),
      'rescheduleAppointment': (p) => this.vapiToolsService.rescheduleAppointment(p),
      'reschedule-appointment': (p) => this.vapiToolsService.rescheduleAppointment(p),
      'cancelAppointment': (p) => this.vapiToolsService.cancelAppointment(p),
      'cancel-appointment': (p) => this.vapiToolsService.cancelAppointment(p),
      'getAppointments': (p) => this.vapiToolsService.getAppointments(p),
      'get-appointments': (p) => this.vapiToolsService.getAppointments(p),

      // Notes
      'addPatientNote': (p) => this.vapiToolsService.addPatientNote(p),
      'add-patient-note': (p) => this.vapiToolsService.addPatientNote(p),

      // Insurance & billing
      'getPatientInsurance': (p) => this.vapiToolsService.getPatientInsurance(p),
      'get-patient-insurance': (p) => this.vapiToolsService.getPatientInsurance(p),
      'getPatientBalance': (p) => this.vapiToolsService.getPatientBalance(p),
      'get-patient-balance': (p) => this.vapiToolsService.getPatientBalance(p),

      // Providers
      'getProviders': (p) => this.vapiToolsService.getProviders(p),
      'get-providers': (p) => this.vapiToolsService.getProviders(p),

      // Call transfer
      'transferToHuman': (p) => this.vapiToolsService.transferToHuman(p),
      'transfer-to-human': (p) => this.vapiToolsService.transferToHuman(p),
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

import { Controller, Post, Body, Headers, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { VapiToolsService } from './vapi-tools.service';

@Controller('vapi/tools')
export class VapiToolsController {
  private readonly logger = new Logger(VapiToolsController.name);

  constructor(private readonly vapiToolsService: VapiToolsService) {}

  @Post('transfer-to-human')
  async transferToHuman(
    @Body() body: any,
    @Headers('x-vapi-signature') signature: string,
  ) {
    this.verifyWebhookSignature(signature);
    this.logger.log('Transfer to human tool called');
    return this.vapiToolsService.transferToHuman(body);
  }

  @Post('book-appointment')
  async bookAppointment(
    @Body() body: any,
    @Headers('x-vapi-signature') signature: string,
  ) {
    this.verifyWebhookSignature(signature);
    this.logger.log('Book appointment tool called');
    return this.vapiToolsService.bookAppointment(body);
  }

  @Post('check-availability')
  async checkAvailability(
    @Body() body: any,
    @Headers('x-vapi-signature') signature: string,
  ) {
    this.verifyWebhookSignature(signature);
    this.logger.log('Check availability tool called');
    return this.vapiToolsService.checkAvailability(body);
  }

  @Post('get-patient-info')
  async getPatientInfo(
    @Body() body: any,
    @Headers('x-vapi-signature') signature: string,
  ) {
    this.verifyWebhookSignature(signature);
    this.logger.log('Get patient info tool called');
    return this.vapiToolsService.getPatientInfo(body);
  }

  @Post('search-patients')
  async searchPatients(
    @Body() body: any,
    @Headers('x-vapi-signature') signature: string,
  ) {
    this.verifyWebhookSignature(signature);
    this.logger.log('Search patients tool called');
    return this.vapiToolsService.searchPatients(body);
  }

  @Post('create-patient')
  async createPatient(
    @Body() body: any,
    @Headers('x-vapi-signature') signature: string,
  ) {
    this.verifyWebhookSignature(signature);
    this.logger.log('Create patient tool called');
    return this.vapiToolsService.createPatient(body);
  }

  @Post('update-patient')
  async updatePatient(
    @Body() body: any,
    @Headers('x-vapi-signature') signature: string,
  ) {
    this.verifyWebhookSignature(signature);
    this.logger.log('Update patient tool called');
    return this.vapiToolsService.updatePatient(body);
  }

  @Post('cancel-appointment')
  async cancelAppointment(
    @Body() body: any,
    @Headers('x-vapi-signature') signature: string,
  ) {
    this.verifyWebhookSignature(signature);
    this.logger.log('Cancel appointment tool called');
    return this.vapiToolsService.cancelAppointment(body);
  }

  private verifyWebhookSignature(signature: string) {
    if (signature !== process.env.VAPI_WEBHOOK_SECRET) {
      this.logger.error('Invalid Vapi webhook signature');
      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }
  }
}

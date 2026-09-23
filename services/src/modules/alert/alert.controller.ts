import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { AlertService } from './alert.service';
import { UsageGuard } from '../../guards/usage.guard';

@Controller('alerts')
@UseGuards(AuthGuard)
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  async listAlerts(@Req() req: any) {
    return this.alertService.listAlerts(req.user.id);
  }

  @Post()
  @UseGuards(UsageGuard)
  async createAlert(@Req() req: any, @Body() body: any) {
    return this.alertService.createAlert(req.plan, req.user.id, body);
  }

  @Post('verify-webhook')
  @UseGuards(UsageGuard)
  async verifyWebhook(@Req() req: any, @Body() payload: any) {
    return this.alertService.verifyWebhook({
      plan: req.plan,
      signature: payload.signature,
      timestamp: payload.timestamp,
      body: payload.body,
    });
  }
}

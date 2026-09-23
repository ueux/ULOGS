import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { UsageGuard } from '../../guards/usage.guard';
import { AuthGuard } from '../../guards/auth.guard';
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}
  @Get('current')
  @UseGuards(AuthGuard, UsageGuard)
  async getCurrent(@Req() req: any) {
    return this.billingService.getCurrentPlan(req);
  }
  @Get('invoices')
  @UseGuards(AuthGuard)
  async getInvoices(@Req() req: any) {
    return this.billingService.getInvoices(req.user.id);
  }

  @Post()
  @UseGuards(AuthGuard)
  async createBillingSession(
    @Req() req: any,
    @Body('plan') selectedPlan: string,
  ) {
    return this.billingService.createBillingSession(req.user.id, selectedPlan);
  }
  @Post('portal')
  @UseGuards(AuthGuard)
  async createPortalSession(@Req() req: any) {
    return this.billingService.createPortalSession(req.user.id);
  }
  @Post('webhook')
  async handleStripeWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.billingService.handleStripeWebhook(signature, req.rawBody);
  }
}

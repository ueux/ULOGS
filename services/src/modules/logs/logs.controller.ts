import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { LogsService } from './logs.service';
import express from 'express';
import { UsageGuard } from '../../guards/usage.guard';

@Controller('logs')
@UseGuards(AuthGuard)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}
  @Get()
  async getLogs(@Req() req: any) {
    return this.logsService.getLogs(req);
  }
  @Post('send')
  @UseGuards(UsageGuard)
  async sendLogs(@Req() req: any, @Body() body: any) {
    return this.logsService.sendLogs(
      body,
      req.user.keyId,
      req.user.id,
      req.plan,
    );
  }
  @Get('stream')
  async startSSE(@Req() req: any, @Res() res: express.Response) {
    return this.logsService.startSSE(req, res);
  }
  @Get('get-dashboard-logs')
  async getDashboardLogs(@Req() req: any) {
    return this.logsService.getLogs(req);
  }
  @Get('metrics/stream')
  async metricsSSE(@Req() req: any, @Res() res: express.Response) {
    return this.logsService.metricsSSE(req, res);
  }
}

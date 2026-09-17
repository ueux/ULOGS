import { Module } from '@nestjs/common';
import { ApiKeyController } from './api-key.controller';
import { APIKeyService } from './api-key.service';

@Module({
  imports: [],
  controllers: [ApiKeyController],
  providers: [APIKeyService],
})
export class APIKeyModule {}

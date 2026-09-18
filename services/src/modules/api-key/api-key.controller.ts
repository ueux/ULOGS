import { Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { APIKeyService } from "./api-key.service";
import { AuthGaurd } from "../../guards/auth.guard";

@Controller('api-keys')
@UseGuards(AuthGaurd)
export class ApiKeyController {
    constructor(private readonly apiKeyService: APIKeyService) { }
    @Post()
    async createApikry(@Req() req: any) {
        return this.apiKeyService.createApiKey(req.user.id);
    }
    @Get()
    async listApiKeys(@Req() req: any) {
        return this.apiKeyService.listApiKeys(req.user.id);
    }
    @Get(':id')
    async apikeyLastUsed(@Req() req: any, @Param('id') id: string) {
        return this.apiKeyService.getApiKeyLastUsed(id);
    }
    @Delete(':id')
    async deleteApiKey(@Req() req: any, @Param('id') id: string) {
        return this.apiKeyService.deleteApiKey(req.user.id,id);
    }
    @Post(':id/regenerate')
    async regenerateApiKey(@Req() req: any, @Param('id') id: string) {
        return this.apiKeyService.regenerateApiKey(req.user.id,id);
    }
}
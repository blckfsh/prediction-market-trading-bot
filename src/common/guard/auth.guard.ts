import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configuredKey = this.configService.get<string>('PREDICT_API_KEY');

    if (!configuredKey) {
      throw new UnauthorizedException('API key is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.getTokenFromRequest(request);

    if (!token || !this.isApiKeyMatch(token, configuredKey)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }

  private getTokenFromRequest(request: Request): string | null {
    const apiKeyHeader = this.getHeaderValue(request, 'x-api-key');
    return apiKeyHeader ? apiKeyHeader.trim() : null;
  }

  private getHeaderValue(request: Request, key: string): string | null {
    const raw = request.headers?.[key as keyof typeof request.headers];
    if (Array.isArray(raw)) {
      return raw[0] ?? null;
    }
    return typeof raw === 'string' ? raw : null;
  }

  private isApiKeyMatch(provided: string, configured: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const configuredBuffer = Buffer.from(configured);
    if (providedBuffer.length !== configuredBuffer.length) {
      return false;
    }
    return timingSafeEqual(providedBuffer, configuredBuffer);
  }
}


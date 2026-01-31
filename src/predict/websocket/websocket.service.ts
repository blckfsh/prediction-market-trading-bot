import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, EventCallback } from 'src/predict/types/websocket.types';
import { RealtimeClient } from 'src/lib/clients/predict';

type SubscriptionHandle = { unsubscribe: () => void };

@Injectable()
export class WebsocketService implements OnModuleDestroy {
  private readonly logger = new Logger(WebsocketService.name);
  private client: RealtimeClient | null = null;
  private refreshIntervalId: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {}

  connect(): RealtimeClient {
    if (this.client) {
      return this.client;
    }

    const rawUrl = this.configService.get<string>('PREDICT_WS_URL');
    if (!rawUrl) {
      throw new Error('PREDICT_WS_URL is not configured');
    }

    const url = this.buildWebsocketUrl(rawUrl);
    const maxConnAttempts = Number(
      this.configService.get<string>('PREDICT_WS_MAX_ATTEMPTS') ?? 5,
    );
    const maxRetryInterval = Number(
      this.configService.get<string>('PREDICT_WS_MAX_RETRY_INTERVAL_MS') ?? 30000,
    );

    this.client = new RealtimeClient(
      url,
      { maxConnAttempts, maxRetryInterval },
      this.logger,
    );

    this.startRefreshLoop();
    this.logger.log('Predict websocket connected');
    return this.client;
  }

  subscribe(topic: Channel, callback: EventCallback): SubscriptionHandle {
    return this.connect().subscribe(topic, callback);
  }

  close(): void {
    if (!this.client) {
      return;
    }
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    this.client.close();
    this.client = null;
  }

  onModuleDestroy(): void {
    this.close();
  }

  private buildWebsocketUrl(baseUrl: string): string {
    const url = new URL(baseUrl);
    const apiKey = this.configService.get<string>('PREDICT_API_KEY');

    if (apiKey && !url.searchParams.has('apiKey')) {
      url.searchParams.set('apiKey', apiKey);
    }

    return url.toString();
  }

  private startRefreshLoop(): void {
    if (!this.client || this.refreshIntervalId) {
      return;
    }
    const intervalMs = Number(
      this.configService.get<string>('PREDICT_WS_REFRESH_INTERVAL_MS') ?? 60000,
    );
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return;
    }
    this.refreshIntervalId = setInterval(() => {
      this.client?.refreshSubscriptions();
    }, intervalMs);
  }
}


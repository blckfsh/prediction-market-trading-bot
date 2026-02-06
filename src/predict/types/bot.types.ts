import { ConfigService } from '@nestjs/config';

export type RefreshLoopState = {
  intervalId: NodeJS.Timeout | null;
  inFlight: boolean;
};

export type RefreshLoopDeps = {
  configService: ConfigService;
};


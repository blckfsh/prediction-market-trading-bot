import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

export type RefreshLoopState = {
  intervalId: NodeJS.Timeout | null;
  inFlight: boolean;
};

export type RefreshLoopDeps = {
  configService: ConfigService;
  logger: Logger;
};


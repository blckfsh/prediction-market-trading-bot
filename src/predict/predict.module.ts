import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { PredictRepository } from './predict.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { PredictController } from './predict.controller';
import { PredictService } from './predict.service';
import { PredictRealtimeService } from './websocket.service';

@Module({
  controllers: [PredictController],
  providers: [
    BotService,
    PredictService,
    PredictRepository,
    PrismaService,
    PredictRealtimeService,
  ],
  exports: [BotService, PredictService, PredictRealtimeService],
})
export class PredictModule {}

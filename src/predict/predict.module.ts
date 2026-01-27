import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { PredictRepository } from './predict.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { PredictController } from './predict.controller';
import { PredictService } from './predict.service';
import { WebsocketService } from './websocket.service';

@Module({
  controllers: [PredictController],
  providers: [
    BotService,
    PredictService,
    PredictRepository,
    PrismaService,
    WebsocketService,
  ],
  exports: [BotService, PredictService, WebsocketService],
})
export class PredictModule {}

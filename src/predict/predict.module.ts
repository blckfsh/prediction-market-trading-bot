import { Module } from '@nestjs/common';
import { BotService } from './bot/bot.service';
import { PredictRepository } from './predict.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { PredictController } from './predict.controller';
import { PredictService } from './predict.service';
import { WebsocketService } from './websocket/websocket.service';
import { TradeService } from './trade/trade.service';
import { RedeemService } from './redeem/redeem.service';

@Module({
  controllers: [PredictController],
  providers: [
    BotService,
    PredictService,
    PredictRepository,
    PrismaService,
    WebsocketService,
    TradeService,
    RedeemService,
  ],
  exports: [BotService, PredictService, WebsocketService],
})
export class PredictModule {}

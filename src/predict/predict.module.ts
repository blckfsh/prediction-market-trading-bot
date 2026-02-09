import { Module } from '@nestjs/common';
import { BotService } from 'src/bot/bot.service';
import { PredictRepository } from './predict.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { PredictController } from './predict.controller';
import { PredictService } from './predict.service';
import { PredictRealtimeService } from 'src/websocket/predict-realtime.service';
import { TradeService } from 'src/trade/trade.service';
import { RedeemService } from 'src/redeem/redeem.service';

@Module({
  controllers: [PredictController],
  providers: [
    BotService,
    PredictService,
    PredictRepository,
    PrismaService,
    PredictRealtimeService,
    TradeService,
    RedeemService,
  ],
  exports: [BotService, PredictService, PredictRealtimeService],
})
export class PredictModule {}

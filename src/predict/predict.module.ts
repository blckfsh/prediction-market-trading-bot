import { Module } from '@nestjs/common';
import { PredictService } from './predict.service';
import { PredictRepository } from './predict.repository';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [PredictService, PredictRepository, PrismaService],
  exports: [PredictService],
})
export class PredictModule {}


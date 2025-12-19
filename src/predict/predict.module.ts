import { Module } from '@nestjs/common';
import { PredictService } from './predict.service';

@Module({
  providers: [PredictService],
  exports: [PredictService], // Export so other modules can use it
})
export class PredictModule {}


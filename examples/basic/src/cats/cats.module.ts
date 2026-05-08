import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatsController } from './cats.controller';
import { CatsService } from './cats.service';

@Module({
  imports: [AuthModule],
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}

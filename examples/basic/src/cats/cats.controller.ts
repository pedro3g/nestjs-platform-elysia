import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { t } from 'elysia';
import { RouteDetail, RouteSchema } from 'nestjs-platform-elysia';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { type Cat, CatsService } from './cats.service';

@Controller('cats')
export class CatsController {
  constructor(private readonly cats: CatsService) {}

  @Get()
  @RouteDetail({ summary: 'List all cats', tags: ['cats'] })
  findAll(): Cat[] {
    return this.cats.findAll();
  }

  @Get(':id')
  @RouteDetail({ summary: 'Find a cat by id', tags: ['cats'] })
  findOne(@Param('id', ParseIntPipe) id: number): Cat {
    const cat = this.cats.findOne(id);
    if (!cat) throw new HttpException('Cat not found', HttpStatus.NOT_FOUND);
    return cat;
  }

  @Post()
  @UseGuards(AuthGuard)
  @Roles('admin')
  @RouteSchema({
    body: t.Object({
      name: t.String({ minLength: 1 }),
      age: t.Number({ minimum: 0 }),
    }),
  })
  @RouteDetail({ summary: 'Create a cat (admin only)', tags: ['cats'] })
  create(@Body() body: { name: string; age: number }): Cat {
    return this.cats.create(body);
  }
}

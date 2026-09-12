import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  CreateCourseSchema,
  EnrollCourseSchema,
  type CreateCourseDto,
  type EnrollCourseDto,
} from './dto/course.dto.js';
import { CoursesService } from './courses.service.js';

@Controller('admin/courses')
export class CoursesController {
  constructor(@Inject(CoursesService) private readonly svc: CoursesService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, id) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateCourseSchema)) dto: CreateCourseDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Post(':id/enroll')
  @HttpCode(201)
  async enroll(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EnrollCourseSchema)) dto: EnrollCourseDto,
  ) {
    return { data: await this.svc.enroll(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Post(':id/enrollments/:enrollmentId/cancel')
  async cancelEnrollment(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
  ) {
    return {
      data: await this.svc.cancelEnrollment(user.tenantId, user.sub, user.role, id, enrollmentId),
    };
  }
}

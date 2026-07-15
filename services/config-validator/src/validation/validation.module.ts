import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';
import { SchemaValidationService } from './schema/schema-validation.service';

@Module({
  imports: [LlmModule],
  controllers: [ValidationController],
  providers: [ValidationService, SchemaValidationService],
})
export class ValidationModule {}

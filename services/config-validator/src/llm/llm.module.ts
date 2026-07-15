import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ModelFactory } from './model.factory';
import { MockProvider } from './providers/mock.provider';

@Module({
  providers: [LlmService, ModelFactory, MockProvider],
  exports: [LlmService],
})
export class LlmModule {}

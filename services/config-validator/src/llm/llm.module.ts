import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER } from './llm.provider.interface';
import { LlmService } from './llm.service';
import { GeminiProvider } from './providers/gemini.provider';
import { MockProvider } from './providers/mock.provider';

@Module({
  providers: [
    LlmService,
    GeminiProvider,
    MockProvider,
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService, GeminiProvider, MockProvider],
      useFactory: (
        config: ConfigService,
        gemini: GeminiProvider,
        mock: MockProvider,
      ) => (config.get<string>('llm.provider') === 'mock' ? mock : gemini),
    },
  ],
  exports: [LlmService],
})
export class LlmModule {}

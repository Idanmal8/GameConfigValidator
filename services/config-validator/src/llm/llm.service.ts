import { Inject, Injectable } from '@nestjs/common';
import {
  LLM_PROVIDER,
  LlmAnalyzeOptions,
  LlmFeedback,
  LlmProvider,
} from './llm.provider.interface';

/** Provider-agnostic facade used by the rest of the app. */
@Injectable()
export class LlmService {
  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  analyze(config: unknown, options?: LlmAnalyzeOptions): Promise<LlmFeedback> {
    return this.provider.analyze(config, options);
  }
}

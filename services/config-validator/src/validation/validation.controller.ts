import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ValidationService } from './validation.service';
import { LlmService } from '../llm/llm.service';
import { LevelConfigDto } from './dto/level-config.dto';
import { ValidationResponseDto } from './dto/validation-response.dto';

@ApiTags('validation')
@Controller()
export class ValidationController {
  constructor(
    private readonly validationService: ValidationService,
    private readonly llm: LlmService,
  ) {}

  @Get('providers')
  @ApiOperation({
    summary: 'List LLM providers with live availability',
    description:
      'Reports which providers are configured (key loaded) so the UI can show enabled / needs-key.',
  })
  providers() {
    return this.llm.listProviders();
  }

  @Post('validate')
  @ApiOperation({
    summary: 'Validate a game level configuration',
    description:
      'Runs JSON Schema validation (ajv) and, when valid, LLM game-design analysis.',
  })
  @ApiQuery({
    name: 'provider',
    required: false,
    description: 'Optional provider override: ollama (default) / gemini / openai / mock.',
  })
  @ApiQuery({
    name: 'model',
    required: false,
    description: 'Optional model override, e.g. llama3.2 / gemini-3.1-flash-lite / gpt-4o-mini.',
  })
  @ApiBody({ type: LevelConfigDto })
  @ApiOkResponse({ type: ValidationResponseDto })
  validate(
    @Body() body: string,
    @Query('provider') provider?: string,
    @Query('model') model?: string,
  ): Promise<ValidationResponseDto> {
    return this.validationService.validate(body, { provider, model });
  }
}

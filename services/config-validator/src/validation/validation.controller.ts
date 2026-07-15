import { Body, Controller, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ValidationService } from './validation.service';
import { LevelConfigDto } from './dto/level-config.dto';
import { ValidationResponseDto } from './dto/validation-response.dto';

@ApiTags('validation')
@Controller()
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Post('validate')
  @ApiOperation({
    summary: 'Validate a game level configuration',
    description:
      'Runs JSON Schema validation (ajv) and, when valid, LLM game-design analysis.',
  })
  @ApiQuery({
    name: 'model',
    required: false,
    description: 'Optional model override, e.g. gemini-3.5-flash / gemini-3.1-flash-lite.',
  })
  @ApiBody({ type: LevelConfigDto })
  @ApiOkResponse({ type: ValidationResponseDto })
  validate(
    @Body() body: string,
    @Query('model') model?: string,
  ): Promise<ValidationResponseDto> {
    return this.validationService.validate(body, model);
  }
}

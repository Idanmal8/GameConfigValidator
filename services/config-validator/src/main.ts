import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { text as textBodyParser } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use(
    textBodyParser({
      type: ['application/json', 'application/*+json', 'text/plain'],
      limit: '1mb',
    }),
  );
  app.enableCors();

  app.useStaticAssets(join(__dirname, '..', 'public'));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Game Config Validator')
    .setDescription(
      'Schema + LLM validation for game level configurations. ' +
        'POST a config to /validate to get schema results and LLM game-design feedback.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  const port = app.get(ConfigService).get<number>('port') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`config-validator listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`  UI:      http://localhost:${port}/`);
  // eslint-disable-next-line no-console
  console.log(`  Swagger: http://localhost:${port}/api`);
}

void bootstrap();

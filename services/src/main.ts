import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { createLogsTable } from './clickhouse/schema';
import { startLogsConsumer } from './nats/consumer';
import { NestExpressApplication } from '@nestjs/platform-express'
import { initNatsStream } from './nats/initStream';
import { startWorkers } from './infra/start.worker';
import { BodyParserExceptionFilter } from './filters/body-parser-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true, rawBody: true });
  app.useBodyParser('json', { limit: '3mb' })
  app.useBodyParser('urlencoded', { limit: '3mb' ,extended:true})
  await createLogsTable()
  await initNatsStream()
  await startWorkers()

  app.setGlobalPrefix("api")
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion:"1"
  })
  app.enableCors({
    origin: true,
    methods: 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS',
    credentials:true
  })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform:true
    })
  )
  app.useGlobalFilters(new BodyParserExceptionFilter(app.getHttpAdapter()))
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

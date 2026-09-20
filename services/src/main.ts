import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { createLogsTable } from './clickhouse/schema';
import { startLogsConsumer } from './nats/consumer';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  await createLogsTable()
  void startLogsConsumer().catch((error)=>{
    console.error('ULOGS Logs Consumer failed to start',error);
  })

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
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

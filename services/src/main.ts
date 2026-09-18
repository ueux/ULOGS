import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
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

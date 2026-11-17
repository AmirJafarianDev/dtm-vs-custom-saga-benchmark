import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('OrderService');
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('Order Service API & Saga Orchestrator')
    .setDescription(
      'Order lifecycle management and distributed transaction orchestrators: DTM Server (Method A) vs Custom In-Process Saga (Method B)',
    )
    .setVersion('1.0.0')
    .addTag('Orders', 'Distributed Saga checkout and order lifecycle management')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3002;
  await app.listen(port);
  logger.log(`Order Service is running on http://localhost:${port}`);
  logger.log(`Swagger documentation available on http://localhost:${port}/api/docs`);
  logger.log(`Metrics available on http://localhost:${port}/metrics`);
}

bootstrap();

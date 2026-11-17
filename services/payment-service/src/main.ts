import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('PaymentService');
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('Payment Service API')
    .setDescription('Manages wallet accounts, balance deductions, and Saga compensation refunds')
    .setVersion('1.0.0')
    .addTag('Payments')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3003;
  await app.listen(port);
  logger.log(`Payment Service is running on http://localhost:${port}`);
  logger.log(`Swagger documentation available on http://localhost:${port}/api/docs`);
  logger.log(`Metrics available on http://localhost:${port}/metrics`);
}

bootstrap();

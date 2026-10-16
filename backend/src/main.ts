import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { MonitoringService } from './monitoring/monitoring.service';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser'

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MadyPro Clean API')
    .setDescription("Documentation de l'API MadyPro Clean (back-office et intégrations tierces)")
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKey')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);
  const envOrigins = process.env.CORS_ORIGIN?.split(',').filter(Boolean) ?? [];
  const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:4173',
    'https://madypro-fullstack.vercel.app'
  ];
  const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultOrigins]));
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  // Promesses rejetées sans gestionnaire : relevées dans le journal d'erreurs plutôt que perdues.
  const monitoring = app.get(MonitoringService);
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    monitoring.record({ source: 'SERVER', message: err.message, stack: err.stack, path: 'tâche de fond' }).catch(() => undefined);
  });
  const config = app.get(ConfigService);
  const port = config.get('app.port') || 3000;
  await app.listen(port);
  console.log(`API running on port ${port}`);
}

bootstrap();

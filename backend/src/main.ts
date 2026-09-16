import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { NextFunction, Request, Response } from 'express'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const configService = app.get(ConfigService)

  // Si CORS_ORIGIN est défini (recommandé en production, ex. "https://votredomaine.com"), on s'y limite.
  // Sinon (usage réseau local pour la mosquée), on autorise toute origine par simplicité.
  const configuredOrigins = (configService.get<string>('CORS_ORIGIN') || '')
    .split(',').map((origin) => origin.trim()).filter(Boolean)
  const allowedOrigins = new Set(configuredOrigins)
  if (allowedOrigins.has('http://localhost:5173')) allowedOrigins.add('http://127.0.0.1:5173')
  if (allowedOrigins.has('http://127.0.0.1:5173')) allowedOrigins.add('http://localhost:5173')
  app.enableCors({ origin: allowedOrigins.size ? [...allowedOrigins] : true })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    next()
  })

  // Sert les fichiers audio téléversés (annonces vocales) de façon accessible à tous les appareils
  const uploadsDir = join(__dirname, '..', 'uploads')
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true })
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' })

  const port = Number(configService.get<number>('PORT')) || 3000
  await app.listen(port)
}

void bootstrap()

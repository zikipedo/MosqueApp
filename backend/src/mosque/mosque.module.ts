import { Module } from '@nestjs/common'
import { MosqueController } from './mosque.controller'
import { MosqueService } from './mosque.service'

@Module({ controllers: [MosqueController], providers: [MosqueService] })
export class MosqueModule {}

import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname } from 'path'
import { MosqueService } from './mosque.service'

@Controller('api')
export class MosqueController {
  constructor(private readonly mosqueService: MosqueService) {}

  @Get('public/dashboard')
  getPublicDashboard() {
    return this.mosqueService.getPublicDashboard()
  }

  @Patch('admin/mosques/:mosqueId/settings')
  updateSettings(@Param('mosqueId') mosqueId: string, @Body() body: { maxPrayerMins?: number; name?: string; city?: string; phone?: string; logoUrl?: string | null; contactEmail?: string; ticker?: string; prayerDurations?: Record<string, number>; notificationDelay?: number; jumuahTime?: string; imamName?: string; prayerTimes?: Array<{ name: string; adhan: string; iqamah: string }> }) {
    return this.mosqueService.updateSettings(mosqueId, body)
  }

  @Patch('admin/prayers/:id')
  updatePrayer(@Param('id') id: string, @Body() body: { adhan?: string; iqamah?: string }) {
    return this.mosqueService.updatePrayerTime(id, body)
  }

  // Téléverse un enregistrement/fichier audio et renvoie une URL permanente (accessible depuis n'importe quel appareil)
  @Post('admin/mosques/:mosqueId/announcements/audio')
  @UseInterceptors(FileInterceptor('audio', {
    storage: diskStorage({
      destination: './uploads',
      filename: (_req, file, callback) => callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname) || '.webm'}`),
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
  }))
  uploadAnnouncementAudio(@UploadedFile() file: Express.Multer.File) {
    return { url: `/uploads/${file.filename}`, name: file.originalname }
  }

  @Post('admin/mosques/:mosqueId/announcements')
  publishAnnouncement(@Param('mosqueId') mosqueId: string, @Body() body: { text: string; mode?: string; audioUrl?: string; audioName?: string; times?: string[]; days?: number }) {
    return this.mosqueService.publishAnnouncement(mosqueId, body)
  }

  @Delete('admin/mosques/:mosqueId/announcements/:id')
  deleteAnnouncement(@Param('mosqueId') mosqueId: string, @Param('id') id: string) {
    return this.mosqueService.deleteAnnouncement(mosqueId, id)
  }

  @Post('mobile/mosques/:mosqueId/push-subscriptions')
  subscribeToPush(@Param('mosqueId') mosqueId: string, @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.mosqueService.savePushSubscription(mosqueId, body)
  }

  @Get('mobile/push-config')
  getPushConfig() {
    return this.mosqueService.getPushConfig()
  }
}

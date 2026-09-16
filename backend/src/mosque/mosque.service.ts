import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import webpush from 'web-push'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class MosqueService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY')
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY')
    const subject = config.get<string>('VAPID_SUBJECT') || 'mailto:admin@masjid-al-nour.ml'
    const hasValidVapidKeys = publicKey && privateKey && !publicKey.startsWith('generate-with') && !privateKey.startsWith('generate-with')
    if (hasValidVapidKeys) webpush.setVapidDetails(subject, publicKey, privateKey)
  }

  async getPublicDashboard() {
    const mosque = await this.prisma.mosque.findFirst({
      include: {
        prayerTimes: { orderBy: { sortOrder: 'asc' } },
        announcements: { where: { isPublished: true }, orderBy: { createdAt: 'desc' } },
        holidays: { orderBy: { date: 'asc' } },
      },
    })
    if (!mosque) throw new NotFoundException('Aucune mosquée configurée')
    return mosque
  }

  async updateSettings(mosqueId: string, data: { maxPrayerMins?: number; name?: string; city?: string; phone?: string; logoUrl?: string | null; contactEmail?: string; ticker?: string; prayerDurations?: Record<string, number>; notificationDelay?: number; jumuahTime?: string; imamName?: string; prayerTimes?: Array<{ name: string; adhan: string; iqamah: string }> }) {
    const { prayerTimes, ...settings } = data
    return this.prisma.$transaction(async (transaction: any) => {
      const mosque = await transaction.mosque.update({ where: { id: mosqueId }, data: settings })
      if (prayerTimes) {
        for (const prayer of prayerTimes) {
          await transaction.prayerTime.updateMany({
            where: { mosqueId, name: prayer.name },
            data: { adhan: prayer.adhan, iqamah: prayer.iqamah },
          })
        }
      }
      return transaction.mosque.findUniqueOrThrow({
        where: { id: mosque.id },
        include: { prayerTimes: { orderBy: { sortOrder: 'asc' } } },
      })
    })
  }

  async savePushSubscription(mosqueId: string, data: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    await this.prisma.mosque.findUniqueOrThrow({ where: { id: mosqueId } })
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      update: { mosqueId, p256dh: data.keys.p256dh, auth: data.keys.auth },
      create: { mosqueId, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth },
    })
  }

  getPushConfig() {
    return { publicKey: this.config.get<string>('VAPID_PUBLIC_KEY') || null }
  }

  async updatePrayerTime(id: string, data: { adhan?: string; iqamah?: string }) {
    return this.prisma.prayerTime.update({ where: { id }, data })
  }

  // Crée une annonce programmée (texte affiché / lu à voix haute, ou message vocal), avec ses horaires et sa durée en jours.
  async publishAnnouncement(mosqueId: string, data: { text: string; mode?: string; audioUrl?: string; audioName?: string; times?: string[]; days?: number }) {
    const announcement = await this.prisma.announcement.create({
      data: {
        mosqueId,
        text: data.text,
        mode: data.mode || 'text-display',
        audioUrl: data.audioUrl,
        audioName: data.audioName,
        times: data.times || [],
        days: data.days || 1,
        isPublished: true,
      },
    })
    await this.sendPush(mosqueId, 'Nouvelle annonce', data.text || 'Message vocal de la mosquée')
    return announcement
  }

  // Supprime une annonce programmée (arrêt immédiat et définitif, quel que soit le nombre de jours restants).
  async deleteAnnouncement(mosqueId: string, id: string) {
    return this.prisma.announcement.deleteMany({ where: { id, mosqueId } })
  }

  @Cron('* * * * *')
  async notifyPrayerTimes() {
    const current = new Date()
    const currentTime = `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`
    const currentMinutes = current.getHours() * 60 + current.getMinutes()
    
    const mosques = await this.prisma.mosque.findMany({ include: { prayerTimes: true } })
    for (const mosque of mosques) {
      const delayMinutes = mosque.notificationDelay || 15
      
      for (const prayer of mosque.prayerTimes) {
        const [prayerHours, prayerMins] = prayer.adhan.split(':').map(Number)
        const prayerMinutes = prayerHours * 60 + prayerMins
        
        // Notification avant l'Adhan (configurable delay)
        // Vérifier si on est exactement X minutes avant l'heure de prière
        if (currentMinutes === prayerMinutes - delayMinutes) {
          await this.sendPush(mosque.id, `Prochaine prière · ${prayer.name}`, `L'Adhan pour ${prayer.name} aura lieu dans ${delayMinutes} minutes.`)
        }
        
        // Notification exacte à l'Adhan
        if (prayer.adhan === currentTime) {
          await this.sendPush(mosque.id, `Adhan · ${prayer.name}`, `C'est l'heure de la prière de ${prayer.name}.`)
        }
        
        // Notification à l'Iqamah
        if (prayer.iqamah === currentTime) {
          await this.sendPush(mosque.id, `Iqamah · ${prayer.name}`, 'As-Salat ! Veuillez éteindre vos téléphones portables.')
        }
      }
    }
  }

  private async sendPush(mosqueId: string, messageTitle: string, body: string) {
    if (!this.config.get<string>('VAPID_PUBLIC_KEY') || !this.config.get<string>('VAPID_PRIVATE_KEY')) return
    const mosque = await this.prisma.mosque.findUnique({
      where: { id: mosqueId },
      select: { name: true, city: true, logoUrl: true },
    })
    if (!mosque) return
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { mosqueId } })
    await Promise.all(subscriptions.map(async (subscription: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({
            title: mosque.name,
            body,
            icon: mosque.logoUrl || '/icon.svg',
            badge: '/icon.svg',
            data: { location: mosque.city, messageTitle },
          }),
        )
      } catch (error: unknown) {
        if ((error as { statusCode?: number }).statusCode === 404 || (error as { statusCode?: number }).statusCode === 410) await this.prisma.pushSubscription.delete({ where: { id: subscription.id } })
      }
    }))
  }
}

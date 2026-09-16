import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const mosque = await prisma.mosque.upsert({
    where: { id: 'masjid-al-nour' },
    update: {},
    create: { id: 'masjid-al-nour', name: 'Masjid Al Nour', city: 'Bamako' },
  })
  const prayers = [
    ['Fajr', 'الفجر', '05:18', '05:35', 1],
    ['Dhuhr', 'الظهر', '13:08', '13:25', 2],
    ['Asr', 'العصر', '16:31', '16:48', 3],
    ['Maghrib', 'المغرب', '19:22', '19:27', 4],
    ['Isha', 'العشاء', '20:39', '20:55', 5],
  ] as const
  for (const [name, arabic, adhan, iqamah, sortOrder] of prayers) {
    await prisma.prayerTime.upsert({
      where: { mosqueId_name: { mosqueId: mosque.id, name } },
      update: { arabic, adhan, iqamah, sortOrder },
      create: { mosqueId: mosque.id, name, arabic, adhan, iqamah, sortOrder },
    })
  }
  await prisma.announcement.create({
    data: { mosqueId: mosque.id, text: 'Bienvenue à la prière. Merci de garder le silence dans la salle.', isPublished: true },
  })
  for (const day of [8, 15, 22]) {
    await prisma.holiday.upsert({
      where: { mosqueId_date: { mosqueId: mosque.id, date: new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z`) } },
      update: {},
      create: { mosqueId: mosque.id, date: new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z`), label: 'Jour chômé' },
    })
  }
}

main().finally(() => prisma.$disconnect())

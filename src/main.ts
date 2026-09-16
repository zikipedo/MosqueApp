import './style.css'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import TasbihCounter from './components/TasbihCounter.jsx'

type Prayer = { name: string; arabic: string; adhan: string; iqamah: string; icon: string }
const fallbackPrayers: Prayer[] = [
  { name: 'Fajr',    arabic: 'الفجر', adhan: '05:18', iqamah: '05:35', icon: '☼' },
  { name: 'Dhuhr',   arabic: 'الظهر', adhan: '13:08', iqamah: '13:25', icon: '◉' },
  { name: 'Asr',     arabic: 'العصر', adhan: '16:31', iqamah: '16:48', icon: '◒' },
  { name: 'Maghrib', arabic: 'المغرب', adhan: '19:22', iqamah: '19:27', icon: '◐' },
  { name: 'Isha',    arabic: 'العشاء', adhan: '20:39', iqamah: '20:55', icon: '☾' },
]
let prayers: Prayer[] = [...fallbackPrayers]
const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

// ── Temps réel ──────────────────────────────────────────────
let now = new Date()   // Heure système réelle

let mosqueName = 'Masjid Al Nour'
let mosqueCity = 'Bamako'
let mosqueLogoUrl: string | null = null
let mosqueLogoBlob: Blob | null = null
let mosquePhone = ''
let announcement = 'Bienvenue à la prière. Merci de garder le silence dans la salle.'
let ticker = 'Jumu\'ah : sermon à 13h00  ·  Collecte solidaire pour les familles  ·  Prochaine prière : Dhuhr à 13h08'
let darkScreen = false
let hostMode: 'idle' | 'adhan' | 'prayer' | 'warning' | 'message' = 'idle'
const isAdminApp = window.location.pathname === '/admin'
let activeView: 'home' | 'admin' = isAdminApp ? 'admin' : 'home'
type CalendarEvent = { label: string; kind: 'holiday' | 'islamic' }
const calendarEvents = new Map<string, CalendarEvent[]>()
let maxPrayerMinutes = 25
let jumuahTime = '13:00' // heure du Jumu'ah le vendredi, format HH:MM
let imamName = (typeof localStorage !== 'undefined' ? localStorage.getItem('mosque-imam-name') : '') || ''
const defaultPrayerDurations: Record<string, number> = { Fajr: 20, Dhuhr: 25, Asr: 25, Maghrib: 15, Isha: 25 }
let prayerDurations: Record<string, number> = { ...defaultPrayerDurations }
let audioName = ''
let customAudioUrl: string | null = null
let customAudioBlob: Blob | null = null
let recorder: MediaRecorder | undefined
let recordedChunks: Blob[] = []
let prayerCycleTimer: number | undefined
let prayerWarningTimer: number | undefined
const prayerEventLocks = { adhan: new Set<string>(), iqamah: new Set<string>(), dayStamp: '' }
const isMobileApp = window.location.pathname === '/mobile'
const isMobileLayout = () => isMobileApp
// QR code always points to production URL for consistency
const qrDownloadUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent('https://alnoor.gdamali.net/mobile')}`
const hasMobileAppUrl = true
let mobileView: 'home' | 'prayers' | 'calendar' | 'news' | 'info' | 'services' | 'quran' | 'discover' = 'home'
type ToolView = 'list' | 'prayers' | 'ramadan' | 'tasbih' | 'qibla'
let mobileToolView: ToolView = 'list'
const trackedPrayerNames = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const
type PrayerTracking = Record<string, Record<string, boolean>>
type RamadanTracking = Record<string, boolean>
type TasbihItem = { id: string; phrase: string; count: number; goal: number; custom: boolean }
type TasbihState = { activeId: string; items: TasbihItem[]; loop?: number; beadStyle?: string; soundOn?: boolean }
const readMobileStorage = <T>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}
let trackedPrayers: PrayerTracking = readMobileStorage('mosque-mobile-prayers', {})
let trackedRamadan: RamadanTracking = readMobileStorage('mosque-mobile-ramadan', {})
const defaultTasbihItems: TasbihItem[] = [
  { id: 'subhanallah', phrase: 'SubhanAllah', count: 0, goal: 33, custom: false },
  { id: 'alhamdulillah', phrase: 'Alhamdulillah', count: 0, goal: 33, custom: false },
  { id: 'allahu-akbar', phrase: 'Allahu Akbar', count: 0, goal: 33, custom: false },
]
const storedTasbih = readMobileStorage<TasbihState | { phrase: string; count: number; goal: number }>('mosque-mobile-tasbih', { activeId: 'subhanallah', items: defaultTasbihItems })
let tasbihState: TasbihState = 'items' in storedTasbih
  ? storedTasbih
  : { activeId: 'subhanallah', items: [{ id: 'subhanallah', phrase: storedTasbih.phrase, count: storedTasbih.count, goal: storedTasbih.goal, custom: false }] }
let tasbihRotation = 0
let tasbihReactRoot: Root | null = null
let qiblaBearing: number | null = null
let qiblaHeading: number | null = null
let qiblaLocation: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
let qiblaListenerAttached = false
const saveMobileTool = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))
const getTasbihReactState = () => ({
  activeDhikrId: tasbihState.activeId,
  count: tasbihState.items.find((item) => item.id === tasbihState.activeId)?.count || 0,
  loop: tasbihState.loop || 1,
  beadStyle: tasbihState.beadStyle || 'rouge',
  soundOn: tasbihState.soundOn ?? true,
  dhikrs: tasbihState.items.map((item) => ({ id: item.id, name: item.phrase, target: item.goal })),
})
const playTasbihClick = () => {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return
  const audioContext = new AudioContextCtor()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(920, audioContext.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(520, audioContext.currentTime + 0.045)
  gainNode.gain.setValueAtTime(0.045, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.06)
  oscillator.connect(gainNode).connect(audioContext.destination)
  oscillator.addEventListener('ended', () => { void audioContext.close() })
  oscillator.start()
  oscillator.stop(audioContext.currentTime + 0.06)
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character))
type QuranSurah = { number: number; name: string; englishName: string; englishNameTranslation: string; numberOfAyahs: number; revelationType: string }
type QuranAyah = { numberInSurah: number; arabic: string; translation: string }
let quranSurahs: QuranSurah[] = []
let quranSurahsLoading = false
let quranSurahsError = false
let quranOpenSurah: number | null = null
let quranAyahs: QuranAyah[] = []
let quranAyahsLoading = false
let quranAyahsError = false
type DiscoverTopic = 'seerah' | 'piliers' | 'adab' | 'duas'
let discoverTopic: DiscoverTopic = 'seerah'
const mosqueLocationUrl = 'https://maps.app.goo.gl/iYsbfRPPHWEvHQjr5'
// En dev réseau local, le backend tourne sur le port 3000 séparément (VITE_API_URL absent → on le déduit).
// En production, Nginx expose le backend sous /api sur le même domaine/port que le site (443, HTTPS) —
// VITE_API_URL doit alors être défini explicitement (ex. https://votredomaine.com/api).
const apiBaseUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000/api`
const apiOrigin = apiBaseUrl.replace(/\/api\/?$/, '')
const mosqueId = import.meta.env.VITE_MOSQUE_ID || 'masjid-al-nour'
let mosqueEmail = 'contact@masjid-al-nour.ml'
let notificationDelay = 15

// ── Annonces programmées ─────────────────────────────────────
type AnnouncementMode = 'text-display' | 'text-voice' | 'voice'
type ScheduledAnnouncement = {
  id: string
  mode: AnnouncementMode
  text: string
  audioUrl: string | null
  audioName: string
  times: string[]
  days: number
  createdAt: string
}
let scheduledAnnouncements: ScheduledAnnouncement[] = []
const announcementTriggerLocks = new Set<string>()
let announcementDayStamp = ''

// Brouillon en cours de composition dans la régie admin
// (le texte et l'audio enregistré/téléversé — customAudioUrl/audioName — sont mutuellement exclusifs)
let draftText = ''
let draftMode: AnnouncementMode = 'text-display'
let draftTimes: string[] = ['13:00']
let draftDays = 1
document.body.classList.toggle('mobile-mode', isMobileLayout())
document.body.classList.toggle('admin-mode', isAdminApp)
document.documentElement.classList.toggle('admin-mode', isAdminApp)
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js')

const dateKey = (date: Date) => date.toISOString().slice(0, 10)
const normalizeCalendarDate = (value: string) => {
  const parts = value.split(/[-/]/)
  if (parts.length !== 3) return value
  if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
}
const addCalendarEvent = (date: string, event: CalendarEvent) => {
  const events = calendarEvents.get(date) || []
  if (!events.some((item) => item.label === event.label)) events.push(event)
  calendarEvents.set(date, events)
}

const loadCalendarEvents = async () => {
  const year = mobileCalendarDate.getFullYear()
  const month = String(mobileCalendarDate.getMonth() + 1).padStart(2, '0')
  
  // Clear existing events for the current month
  calendarEvents.clear()
  
  // Jours fériés officiels du Mali (civils)
  const maliHolidays = [
    { date: `${year}-01-01`, label: "Jour de l'an" },
    { date: `${year}-01-20`, label: "Fête du Martyr" },
    { date: `${year}-03-26`, label: "Journée de la Démocratie" },
    { date: `${year}-05-01`, label: "Fête du Travail" },
    { date: `${year}-05-25`, label: "Journée de l'Unité Africaine" },
    { date: `${year}-09-22`, label: "Fête de l'Indépendance" },
    { date: `${year}-12-25`, label: "Noël" },
  ]
  
  maliHolidays.forEach((holiday) => addCalendarEvent(holiday.date, { label: holiday.label, kind: 'holiday' }))
  
  // Calendrier hégirien pour les jours fériés musulmans à date variable
  try {
    const response = await fetch(`https://api.aladhan.com/v1/gToHCalendar/${month}/${year}`)
    if (response.ok) {
      const days = await response.json() as { data: Array<{ gregorian: { date: string }; hijri: { day: string; month: { number: number }; holidays: string[] } }> }
      days.data.forEach((day) => {
        const date = normalizeCalendarDate(day.gregorian.date)
        day.hijri.holidays.forEach((label) => {
          if (label) addCalendarEvent(date, { label, kind: 'islamic' })
        })
        const hijriDay = Number(day.hijri.day)
        const hijriMonth = day.hijri.month.number
        const events: Record<string, string> = {
          '9-1': 'Début du Ramadan',
          '9-29': 'Fin probable du Ramadan',
          '9-30': 'Fin probable du Ramadan',
          '10-1': 'Aïd el-Fitr',
          '12-9': 'Jour d’Arafat',
          '12-10': 'Aïd el-Adha (Tabaski)',
          '1-10': 'Achoura',
          '3-12': 'Mawlid an-Nabi',
        }
        const label = events[`${hijriMonth}-${hijriDay}`]
        if (label) addCalendarEvent(date, { label, kind: 'islamic' })
      })
    }
  } catch { /* facultatif */ }
  render()
}

// ── Coran (API publique Alquran.cloud) ──────────────────────
const loadQuranSurahs = async () => {
  if (quranSurahs.length || quranSurahsLoading) return
  quranSurahsLoading = true; quranSurahsError = false; renderMobile()
  try {
    const response = await fetch('https://api.alquran.cloud/v1/surah')
    if (!response.ok) throw new Error('offline')
    const result = await response.json() as { data: QuranSurah[] }
    quranSurahs = result.data
  } catch {
    quranSurahsError = true
  } finally {
    quranSurahsLoading = false; renderMobile()
  }
}

const loadQuranSurah = async (number: number) => {
  quranOpenSurah = number; quranAyahsLoading = true; quranAyahsError = false; quranAyahs = []
  prepareQuranAudio(number)
  renderMobile()
  try {
    const response = await fetch(`https://api.alquran.cloud/v1/surah/${number}/editions/quran-uthmani,fr.hamidullah`)
    if (!response.ok) throw new Error('offline')
    const result = await response.json() as { data: Array<{ ayahs: Array<{ numberInSurah: number; text: string }> }> }
    const [arabicEdition, frenchEdition] = result.data
    quranAyahs = arabicEdition.ayahs.map((ayah, index) => ({
      numberInSurah: ayah.numberInSurah,
      arabic: ayah.text,
      translation: frenchEdition?.ayahs[index]?.text || '',
    }))
  } catch {
    quranAyahsError = true
  } finally {
    quranAyahsLoading = false; renderMobile()
  }
}

const quranAudioUrl = (number: number) => `https://server8.mp3quran.net/afs/${String(number).padStart(3, '0')}.mp3`
const quranAudioFallbackUrl = (number: number) => `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${number}.mp3`
let quranAudioGuardAttached = false
let quranAudio: HTMLAudioElement | null = null
let quranAudioDock: HTMLElement | null = null
let quranAudioSurah: number | null = null
let quranAudioPosition = 0

const ensureQuranAudio = () => {
  if (quranAudio) return quranAudio
  quranAudioDock = document.createElement('div')
  quranAudioDock.className = 'quran-audio-player'
  quranAudioDock.hidden = true
  quranAudioDock.innerHTML = '<div class="quran-audio-progress"><span></span></div><button class="quran-audio-close" type="button" data-quran-close aria-label="Fermer le lecteur"><i class="fas fa-xmark"></i></button><div class="quran-audio-main"><div class="quran-audio-meta"><span>RÉCITATION · AL-AFASY</span><strong data-quran-title>Sourate</strong></div><button class="quran-audio-toggle" type="button" data-quran-toggle aria-label="Lire la récitation"><i class="fas fa-play"></i></button><div class="quran-audio-time"><span data-quran-current>0:00</span><span data-quran-duration>0:00</span></div></div><input class="quran-audio-seek" data-quran-seek type="range" min="0" max="100" value="0" step="0.1" aria-label="Position de la récitation"><audio preload="metadata" aria-label="Lecteur audio du Coran"></audio>'
  document.body.appendChild(quranAudioDock)
  quranAudio = quranAudioDock.querySelector('audio')
  const toggle = quranAudioDock.querySelector<HTMLButtonElement>('[data-quran-toggle]')
  const close = quranAudioDock.querySelector<HTMLButtonElement>('[data-quran-close]')
  const seek = quranAudioDock.querySelector<HTMLInputElement>('[data-quran-seek]')
  const current = quranAudioDock.querySelector<HTMLElement>('[data-quran-current]')
  const duration = quranAudioDock.querySelector<HTMLElement>('[data-quran-duration]')
  const progress = quranAudioDock.querySelector<HTMLElement>('.quran-audio-progress span')
  const formatTime = (value: number) => {
    if (!Number.isFinite(value)) return '0:00'
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
  }
  const refreshControls = () => {
    if (!quranAudio) return
    const ratio = quranAudio.duration > 0 ? quranAudio.currentTime / quranAudio.duration : 0
    if (seek) seek.value = String(ratio * 100)
    if (progress) progress.style.width = `${ratio * 100}%`
    if (current) current.textContent = formatTime(quranAudio.currentTime)
    if (duration) duration.textContent = formatTime(quranAudio.duration)
    if (toggle) {
      toggle.setAttribute('aria-label', quranAudio.paused ? 'Lire la récitation' : 'Mettre en pause')
      toggle.innerHTML = `<i class="fas fa-${quranAudio.paused ? 'play' : 'pause'}"></i>`
    }
  }
  toggle?.addEventListener('click', () => {
    if (!quranAudio) return
    if (quranAudio.paused) void quranAudio.play()
    else quranAudio.pause()
  })
  close?.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    quranAudio?.pause()
    if (quranAudioDock) {
      quranAudioDock.hidden = true
      quranAudioDock.style.display = 'none'
      quranAudioDock.setAttribute('aria-hidden', 'true')
    }
  })
  seek?.addEventListener('input', () => {
    if (!quranAudio || !Number.isFinite(quranAudio.duration)) return
    quranAudio.currentTime = (Number(seek.value) / 100) * quranAudio.duration
    refreshControls()
  })
  quranAudio?.addEventListener('play', refreshControls)
  quranAudio?.addEventListener('pause', refreshControls)
  quranAudio?.addEventListener('timeupdate', refreshControls)
  quranAudio?.addEventListener('loadedmetadata', refreshControls)
  const rememberQuranAudioPosition = () => {
    if (quranAudio && Number.isFinite(quranAudio.currentTime)) quranAudioPosition = quranAudio.currentTime
  }
  quranAudio?.addEventListener('timeupdate', rememberQuranAudioPosition)
  quranAudio?.addEventListener('pause', rememberQuranAudioPosition)
  quranAudio?.addEventListener('seeking', rememberQuranAudioPosition)
  quranAudio?.addEventListener('loadedmetadata', () => {
    if (!quranAudio || quranAudioPosition <= 0 || !Number.isFinite(quranAudio.duration)) return
    quranAudio.currentTime = Math.min(quranAudioPosition, quranAudio.duration)
    refreshControls()
  })
  quranAudio?.addEventListener('error', () => {
    if (!quranAudio || quranAudio.dataset.fallbackLoaded === 'true' || !quranAudioSurah) return
    quranAudio.dataset.fallbackLoaded = 'true'
    quranAudio.src = quranAudioFallbackUrl(quranAudioSurah)
    quranAudio.load()
  })
  return quranAudio
}

const prepareQuranAudio = (number: number) => {
  const audio = ensureQuranAudio()
  if (!audio || (!audio.paused && !audio.ended)) return
  if (quranAudioSurah === number) return
  audio.pause()
  audio.currentTime = 0
  quranAudioPosition = 0
  audio.dataset.fallbackLoaded = 'false'
  audio.src = quranAudioUrl(number)
  quranAudioSurah = number
  audio.load()
  if (quranAudioDock) {
    quranAudioDock.hidden = false
    quranAudioDock.style.display = ''
    quranAudioDock.removeAttribute('aria-hidden')
  }
  const title = quranAudioDock?.querySelector<HTMLElement>('[data-quran-title]')
  if (title) title.textContent = quranSurahs.find((surah) => surah.number === number)?.englishName || `Sourate ${number}`
}

const attachQuranAudioGuard = () => {
  if (quranAudioGuardAttached) return
  document.addEventListener('play', (event) => {
    const currentAudio = event.target
    if (!(currentAudio instanceof HTMLAudioElement)) return
    document.querySelectorAll<HTMLAudioElement>('audio').forEach((audio) => {
      if (audio !== currentAudio) audio.pause()
    })
  }, true)
  document.addEventListener('error', (event) => {
    const audio = event.target
    if (!(audio instanceof HTMLAudioElement) || audio.dataset.fallbackLoaded === 'true') return
    const number = Number(audio.dataset.surah)
    if (!number) return
    audio.dataset.fallbackLoaded = 'true'
    audio.src = quranAudioFallbackUrl(number)
    audio.load()
  }, true)
  quranAudioGuardAttached = true
}
// ── Contenu "Découvrir" : Sîra, piliers, adab quotidien ─────
const seerahMilestones = [
  { period: '570 apr. J.-C.', title: 'Naissance à La Mecque', text: "Muhammad ﷺ naît à La Mecque, dans la tribu des Quraych, l'année de l'Éléphant. Orphelin très jeune, il est élevé par son grand-père puis son oncle Abu Talib." },
  { period: 'Vers 610', title: 'La première révélation', text: "À l'âge de 40 ans, dans la grotte de Hira, l'ange Jibril (Gabriel) lui transmet les premiers versets du Coran. C'est le début de la prophétie." },
  { period: '610 – 622', title: 'La prédication à La Mecque', text: "Pendant treize ans, il appelle discrètement puis publiquement à l'adoration d'un Dieu unique, malgré l'opposition et la persécution des notables mecquois." },
  { period: '622', title: "L'Hégire vers Médine", text: "Pour fuir la persécution, il émigre avec ses compagnons vers Yathrib, rebaptisée Médine. Cet événement marque le début du calendrier musulman (hégirien)." },
  { period: '622 – 630', title: 'La communauté de Médine', text: "Il établit une charte de coexistence entre les communautés de Médine, organise le culte et la vie sociale de la nouvelle communauté musulmane (la Umma)." },
  { period: '630', title: 'La conquête pacifique de La Mecque', text: "Il retourne à La Mecque à la tête des musulmans sans effusion de sang majeure, pardonne à ses anciens opposants et purifie la Kaaba des idoles." },
  { period: '632', title: 'Le pèlerinage d\'adieu et le décès', text: "Lors de son dernier pèlerinage, il prononce un sermon rappelant l'égalité entre les hommes et le respect mutuel. Il décède la même année à Médine, où se trouve son mausolée." },
]
const pillarsOfIslam = [
  { title: 'Ash-Shahada', subtitle: 'L\'attestation de foi', text: 'Témoigner qu\'il n\'y a de divinité digne d\'adoration qu\'Allah et que Muhammad ﷺ est Son messager.' },
  { title: 'As-Salat', subtitle: 'La prière', text: 'Accomplir les cinq prières quotidiennes (Fajr, Dhuhr, Asr, Maghrib, Isha) aux heures prescrites.' },
  { title: 'Az-Zakat', subtitle: "L'aumône légale", text: 'Reverser chaque année une part de son épargne aux nécessiteux, pour purifier ses biens et soutenir la communauté.' },
  { title: 'As-Siyam', subtitle: 'Le jeûne du Ramadan', text: "S'abstenir de nourriture, de boisson et de rapports intimes du lever au coucher du soleil durant le mois de Ramadan." },
  { title: 'Al-Hajj', subtitle: 'Le pèlerinage', text: "Se rendre à La Mecque au moins une fois dans sa vie si l'on en a la capacité physique et financière." },
]
const dailyAdab = [
  { title: 'Commencer par le nom d\'Allah', text: 'Dire "Bismillah" avant de manger, boire ou entreprendre une action, pour placer chaque geste sous la bénédiction divine.' },
  { title: 'Soigner ses paroles', text: 'Éviter la médisance et les propos blessants ; préférer le silence ou une parole bonne, comme le recommande la tradition prophétique.' },
  { title: 'Honorer ses parents', text: "Faire preuve de douceur, de patience et de respect envers ses parents, un devoir rappelé à plusieurs reprises dans le Coran." },
  { title: 'Être ponctuel à la prière', text: 'Prier dès que possible après l\'appel à la prière, de préférence en groupe à la mosquée pour renforcer les liens de la communauté.' },
  { title: 'Garder la propreté', text: "Veiller à sa propreté corporelle et vestimentaire (at-tahara), condition essentielle avant chaque prière." },
  { title: 'Faire preuve de générosité', text: "Partager, aider son voisin et donner en aumône (sadaqa), même modestement, est encouragé au quotidien, pas seulement pendant le Ramadan." },
  { title: 'Rechercher le savoir', text: "« Rechercher la science est une obligation pour tout musulman » : apprendre sa religion et être utile à la société sont valorisés." },
  { title: 'Garder la sincérité (Ikhlas)', text: "Agir pour l'agrément d'Allah plutôt que pour être vu ou félicité par les autres, en toute chose." },
]
const dailyDuas = [
  { title: 'Avant de manger', arabic: 'بِسْمِ اللَّهِ', transliteration: 'Bismillah', text: 'Au nom d’Allah.' },
  { title: 'Après avoir mangé', arabic: 'الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنِي هَذَا', transliteration: 'Al-hamdu lillahil-ladhi at‘amani hadha', text: 'Louange à Allah qui m’a nourri de ceci.' },
  { title: 'En entrant chez soi', arabic: 'بِسْمِ اللَّهِ وَلَجْنَا، وَبِسْمِ اللَّهِ خَرَجْنَا', transliteration: 'Bismillahi walajna, wa bismillahi kharajna', text: 'Au nom d’Allah nous entrons et au nom d’Allah nous sortons.' },
  { title: 'Pour demander le savoir', arabic: 'رَبِّ زِدْنِي عِلْمًا', transliteration: 'Rabbi zidni ‘ilma', text: 'Seigneur, augmente-moi en savoir.' },
  { title: 'En quittant la maison', arabic: 'بِسْمِ اللَّهِ، تَوَكَّلْتُ عَلَى اللَّهِ', transliteration: 'Bismillah, tawakkaltu ‘alallah', text: 'Au nom d’Allah, je place ma confiance en Allah.' },
  { title: 'Pour demander le pardon', arabic: 'رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ', transliteration: 'Rabbighfir li wa tub ‘alayya', text: 'Seigneur, pardonne-moi et accepte mon repentir.' },
  { title: 'Au réveil', arabic: 'الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا', transliteration: 'Al-hamdu lillahil-ladhi ahyana ba‘da ma amatana', text: 'Louange à Allah qui nous a redonné la vie après nous avoir fait mourir.' },
  { title: 'Avant de dormir', arabic: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا', transliteration: 'Bismika Allahumma amutu wa ahya', text: 'C’est en Ton nom, ô Allah, que je meurs et que je vis.' },
  { title: 'En entrant à la mosquée', arabic: 'اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ', transliteration: 'Allahumma iftah li abwaba rahmatik', text: 'Ô Allah, ouvre-moi les portes de Ta miséricorde.' },
  { title: 'En sortant de la mosquée', arabic: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ', transliteration: 'Allahumma inni as’aluka min fadlik', text: 'Ô Allah, je Te demande de Ta grâce.' },
  { title: 'Avant les ablutions', arabic: 'بِسْمِ اللَّهِ', transliteration: 'Bismillah', text: 'Au nom d’Allah.' },
  { title: 'Après les ablutions', arabic: 'أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللَّهُ', transliteration: 'Ashhadu alla ilaha illallah', text: 'J’atteste qu’il n’y a de divinité qu’Allah, Seul et sans associé.' },
  { title: 'Pour ses parents', arabic: 'رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا', transliteration: 'Rabbir-hamhuma kama rabbayani saghira', text: 'Seigneur, fais-leur miséricorde comme ils m’ont élevé lorsque j’étais petit.' },
  { title: 'Pour la guidée', arabic: 'رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا', transliteration: 'Rabbana la tuzigh qulubana ba‘da idh hadaytana', text: 'Seigneur, ne détourne pas nos cœurs après nous avoir guidés.' },
  { title: 'Pour la protection', arabic: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ', transliteration: 'A‘udhu bikalimatillahit-tammati min sharri ma khalaq', text: 'Je cherche refuge dans les paroles parfaites d’Allah contre le mal de ce qu’Il a créé.' },
  { title: 'En cas de difficulté', arabic: 'حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ', transliteration: 'Hasbiyallahu la ilaha illa Huwa', text: 'Allah me suffit, il n’y a de divinité que Lui.' },
  { title: 'Pour la patience', arabic: 'رَبَّنَا أَفْرِغْ عَلَيْنَا صَبْرًا وَتَوَفَّنَا مُسْلِمِينَ', transliteration: 'Rabbana afrigh ‘alayna sabran wa tawaffana muslimin', text: 'Seigneur, déverse sur nous la patience et fais-nous mourir soumis à Toi.' },
  { title: 'Pour la santé', arabic: 'اللَّهُمَّ عَافِنِي فِي بَدَنِي وَاسْمَعِي وَبَصَرِي', transliteration: 'Allahumma ‘afini fi badani wa sam‘i wa basari', text: 'Ô Allah, accorde-moi la santé dans mon corps, mon ouïe et ma vue.' },
  { title: 'Pour un voyage', arabic: 'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا', transliteration: 'Subhanalladhi sakhkhara lana hadha', text: 'Gloire à Celui qui a mis ceci à notre service.' },
  { title: 'Lorsqu’il pleut', arabic: 'اللَّهُمَّ صَيِّبًا نَافِعًا', transliteration: 'Allahumma sayyiban nafi‘an', text: 'Ô Allah, fais que cette pluie soit bénéfique.' },
  { title: 'Pour le bien ici-bas et dans l’au-delà', arabic: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً', transliteration: 'Rabbana atina fid-dunya hasanatan wa fil-akhirati hasanah', text: 'Seigneur, accorde-nous une bonne part ici-bas et une bonne part dans l’au-delà.' },
  { title: 'Pour la gratitude', arabic: 'رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ', transliteration: 'Rabbi awzi‘ni an ashkura ni‘matak', text: 'Seigneur, inspire-moi de Te rendre grâce pour Tes bienfaits.' },
  { title: 'Pour apaiser le cœur', arabic: 'أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ', transliteration: 'Ala bidhikrillahi tatma’innul-qulub', text: 'C’est par l’évocation d’Allah que les cœurs s’apaisent.' },
  { title: 'En entrant aux toilettes', arabic: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْخُبُثِ وَالْخَبَائِثِ', transliteration: 'Allahumma inni a‘udhu bika minal-khubthi wal-khaba’ith', text: 'Ô Allah, je cherche refuge auprès de Toi contre les démons mâles et femelles.' },
  { title: 'En sortant des toilettes', arabic: 'غُفْرَانَكَ', transliteration: 'Ghufranak', text: 'Je Te demande Ton pardon.' },
  { title: 'Après avoir éternué', arabic: 'الْحَمْدُ لِلَّهِ', transliteration: 'Al-hamdu lillah', text: 'Louange à Allah.' },
  { title: 'Réponse à celui qui éternue', arabic: 'يَرْحَمُكَ اللَّهُ', transliteration: 'Yarhamukallah', text: 'Qu’Allah te fasse miséricorde.' },
  { title: 'Pour demander la facilité', arabic: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي', transliteration: 'Rabbishrah li sadri wa yassir li amri', text: 'Seigneur, ouvre ma poitrine et facilite ma tâche.' },
  { title: 'Dans la colère', arabic: 'أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ', transliteration: 'A‘udhu billahi minash-shaytanir-rajim', text: 'Je cherche refuge auprès d’Allah contre Satan le maudit.' },
  { title: 'Pour demander une bonne descendance', arabic: 'رَبِّ هَبْ لِي مِنْ لَدُنْكَ ذُرِّيَّةً طَيِّبَةً', transliteration: 'Rabbi hab li min ladunka dhurriyyatan tayyibah', text: 'Seigneur, accorde-moi une bonne descendance venant de Toi.' },
  { title: 'Pour les époux et les enfants', arabic: 'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ', transliteration: 'Rabbana hab lana min azwajina wa dhurriyyatina qurrata a‘yun', text: 'Seigneur, fais de nos épouses et de nos enfants une joie pour nos yeux.' },
  { title: 'Pour rembourser une dette', arabic: 'اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ', transliteration: 'Allahummak-fini bihalalika ‘an haramik', text: 'Ô Allah, suffis-moi par Ton licite contre Ton illicite et enrichis-moi par Ta grâce.' },
  { title: 'Pour la subsistance', arabic: 'رَبِّ إِنِّي لِمَا أَنْزَلْتَ إِلَيَّ مِنْ خَيْرٍ فَقِيرٌ', transliteration: 'Rabbi inni lima anzalta ilayya min khayrin faqir', text: 'Seigneur, j’ai grand besoin du bien que Tu feras descendre vers moi.' },
  { title: 'Pour visiter un malade', arabic: 'أَسْأَلُ اللَّهَ الْعَظِيمَ رَبَّ الْعَرْشِ الْعَظِيمِ أَنْ يَشْفِيَكَ', transliteration: 'As’alullaha al-‘azim rabbal-‘arshil-‘azim an yashfiyak', text: 'Je demande à Allah, le Très Grand, Seigneur du Trône immense, de te guérir.' },
  { title: 'Pour se protéger du mal', arabic: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ', transliteration: 'Allahumma inni a‘udhu bika minal-hammi wal-hazan', text: 'Ô Allah, je cherche refuge auprès de Toi contre l’angoisse et la tristesse.' },
  { title: 'Pour se protéger de la paresse', arabic: 'وَأَعُوذُ بِكَ مِنَ الْعَجْزِ وَالْكَسَلِ', transliteration: 'Wa a‘udhu bika minal-‘ajzi wal-kasal', text: 'Et je cherche refuge auprès de Toi contre l’incapacité et la paresse.' },
  { title: 'Pour demander une bonne fin', arabic: 'رَبَّنَا تَوَفَّنَا مُسْلِمِينَ وَأَلْحِقْنَا بِالصَّالِحِينَ', transliteration: 'Rabbana tawaffana muslimina wa alhiqna bis-salihin', text: 'Seigneur, fais-nous mourir musulmans et réunis-nous avec les vertueux.' },
  { title: 'À la rupture du jeûne', arabic: 'اللَّهُمَّ إِنِّي لَكَ صُمْتُ وَبِكَ آمَنْتُ وَعَلَيْكَ تَوَكَّلْتُ', transliteration: 'Allahumma inni laka sumtu wa bika amantu wa ‘alayka tawakkaltu', text: 'Ô Allah, j’ai jeûné pour Toi, j’ai cru en Toi et je place ma confiance en Toi.' },
  { title: 'Pour Laylat al-Qadr', arabic: 'اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي', transliteration: 'Allahumma innaka ‘afuwwun tuhibbul-‘afwa fa‘fu ‘anni', text: 'Ô Allah, Tu es Pardonneur et Tu aimes pardonner, alors pardonne-moi.' },
  { title: 'Après l’appel à la prière', arabic: 'اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ', transliteration: 'Allahumma rabba hadhihid-da‘watit-tammah', text: 'Ô Allah, Seigneur de cet appel parfait, accorde à Muhammad la place éminente et le mérite.' },
  { title: 'En entrant au marché', arabic: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ', transliteration: 'La ilaha illallahu wahdahu la sharika lah', text: 'Il n’y a de divinité qu’Allah, Seul et sans associé.' },
  { title: 'Pour demander la sagesse', arabic: 'رَبِّ هَبْ لِي حُكْمًا وَأَلْحِقْنِي بِالصَّالِحِينَ', transliteration: 'Rabbi hab li hukman wa alhiqni bis-salihin', text: 'Seigneur, accorde-moi la sagesse et réunis-moi avec les vertueux.' },
  { title: 'Pour remercier Allah', arabic: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ', transliteration: 'Allahumma a‘inni ‘ala dhikrika wa shukrika wa husni ‘ibadatik', text: 'Ô Allah, aide-moi à T’évoquer, à Te remercier et à bien T’adorer.' },
  { title: 'Pour la lumière', arabic: 'اللَّهُمَّ اجْعَلْ فِي قَلْبِي نُورًا', transliteration: 'Allahummaj‘al fi qalbi nuran', text: 'Ô Allah, mets une lumière dans mon cœur.' },
  { title: 'En voyant la nouvelle lune', arabic: 'اللَّهُمَّ أَهِلَّهُ عَلَيْنَا بِالْأَمْنِ وَالْإِيمَانِ', transliteration: 'Allahumma ahillahu ‘alayna bil-amni wal-iman', text: 'Ô Allah, fais que cette lune nous apporte sécurité et foi.' },
  { title: 'Pour saluer une famille', arabic: 'بَارَكَ اللَّهُ لَكُمْ وَبَارَكَ عَلَيْكُمْ', transliteration: 'Barakallahu lakum wa baraka ‘alaykum', text: 'Qu’Allah vous bénisse et répande Sa bénédiction sur vous.' },
  { title: 'Pour féliciter un mariage', arabic: 'بَارَكَ اللَّهُ لَكَ وَبَارَكَ عَلَيْكَ وَجَمَعَ بَيْنَكُمَا فِي خَيْرٍ', transliteration: 'Barakallahu laka wa baraka ‘alayka wa jama‘a baynakuma fi khayr', text: 'Qu’Allah te bénisse, vous bénisse et vous réunisse dans le bien.' },
  { title: 'Lors d’un malheur', arabic: 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ', transliteration: 'Inna lillahi wa inna ilayhi raji‘un', text: 'Nous appartenons à Allah et c’est vers Lui que nous retournerons.' },
  { title: 'Pour demander la miséricorde', arabic: 'رَبَّنَا وَسِعْتَ كُلَّ شَيْءٍ رَحْمَةً وَعِلْمًا فَاغْفِرْ لِلَّذِينَ تَابُوا', transliteration: 'Rabbana wasi‘ta kulla shay’in rahmatan wa ‘ilman faghfir lilladhina tabu', text: 'Seigneur, Ta miséricorde et Ton savoir embrassent toute chose, pardonne à ceux qui se repentent.' },
  { title: 'Pour rester ferme dans la foi', arabic: 'يَا مُقَلِّبَ الْقُلُوبِ ثَبِّتْ قَلْبِي عَلَى دِينِكَ', transliteration: 'Ya muqallibal-qulub, thabbit qalbi ‘ala dinik', text: 'Ô Toi qui retournes les cœurs, affermis mon cœur sur Ta religion.' },
  { title: 'Pour une bonne action', arabic: 'اللَّهُمَّ تَقَبَّلْ مِنِّي', transliteration: 'Allahumma taqabbal minni', text: 'Ô Allah, accepte cela de ma part.' },
]

let mobileCalendarDate = new Date()

const getNextPrayer = () => {
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const dayOfWeek = now.getDay() // 0 = Sunday, 5 = Friday, 6 = Saturday
  const isFriday = dayOfWeek === 5
  
  // Le vendredi, créer une prière virtuelle "Jumu'ah" pour la logique de la prochaine prière
  if (isFriday) {
    const jumuahMinutes = toMinutes(jumuahTime)
    const nextFromJumuah = prayers.find((prayer) => toMinutes(prayer.adhan) > currentMinutes && prayer.name !== 'Dhuhr') || prayers.find((p) => p.name !== 'Dhuhr') || prayers[0]
    
    // Si l'heure actuelle est avant le Jumu'ah, retourner Jumu'ah comme prochaine prière
    if (currentMinutes < jumuahMinutes) {
      return { name: 'Jumu\'ah', arabic: 'الجمعة', adhan: jumuahTime, iqamah: jumuahTime, icon: '✦' }
    }
    // Sinon, retourner la première prière après le Jumu'ah (qui n'est pas Dhuhr)
    return nextFromJumuah
  }
  
  // Les autres jours, logique normale
  return prayers.find((prayer) => toMinutes(prayer.adhan) > currentMinutes) || prayers[0]
}

const refreshNextPrayerUI = () => {
  const nextPrayer = getNextPrayer()
  const dayOfWeek = now.getDay() // 5 = Friday
  const isFriday = dayOfWeek === 5
  
  document.querySelectorAll<HTMLElement>('.prayer-card').forEach((card, index) => {
    const prayer = prayers[index]
    // Le vendredi, ne pas marquer Dhuhr comme "prochaine" si Jumu'ah est la prochaine prière
    const isNext = (prayer?.name === nextPrayer.name) && !(isFriday && prayer.name === 'Dhuhr' && nextPrayer.name === 'Jumu\'ah')
    card.classList.toggle('next', isNext)
    const label = card.querySelector<HTMLElement>('.next-label')
    if (isNext && !label) card.querySelector('.prayer-top')?.insertAdjacentHTML('beforeend', '<b class="next-label">PROCHAINE</b>')
    if (!isNext && label) label.remove()
  })
  const chourouqEl = document.querySelector<HTMLElement>('.chourouq-hour')
  if (chourouqEl) chourouqEl.textContent = getChourouqTime()
}

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

let customChourouqTime: string | null = (typeof localStorage !== 'undefined' ? localStorage.getItem('mosque-chourouq-time') : null)
let aladhanSunrise: string | null = null

const calculateChourouq = (fajrAdhan: string): string => {
  if (!fajrAdhan) return '06:33'
  const [hStr, mStr] = fajrAdhan.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (isNaN(h) || isNaN(m)) return '06:33'
  // Durée jusqu'au lever du soleil (75 min par défaut pour Bamako / Afrique de l'Ouest)
  const totalMins = (h * 60 + m + 75) % (24 * 60)
  const chH = String(Math.floor(totalMins / 60)).padStart(2, '0')
  const chM = String(totalMins % 60).padStart(2, '0')
  return `${chH}:${chM}`
}

const getChourouqTime = (): string => {
  if (customChourouqTime) return customChourouqTime
  if (aladhanSunrise) return aladhanSunrise
  const fajr = prayers.find((p) => p.name === 'Fajr')
  return calculateChourouq(fajr?.adhan || '05:18')
}

const fetchSunriseTime = async () => {
  try {
    const city = mosqueCity || 'Bamako'
    const res = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Mali&method=3`)
    if (!res.ok) return
    const data = await res.json()
    if (data?.data?.timings?.Sunrise) {
      aladhanSunrise = data.data.timings.Sunrise.substring(0, 5)
      const el = document.querySelector<HTMLElement>('.chourouq-hour')
      if (el) el.textContent = aladhanSunrise
    }
  } catch {
    // Calcul automatique (Fajr + 75min) reste actif
  }
}

// ── Formatage des dates en TEMPS RÉEL ───────────────────────
const formatDate        = (date: Date) => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const formatDayAndMonth = (date: Date) => `${monthNames[date.getMonth()].toUpperCase()} <b>${date.getDate()}</b>`
const formatWeekday     = (date: Date) => date.toLocaleDateString('fr-FR', { weekday: 'long' }).toUpperCase()
const formatHijriShort  = (date: Date) => {
  // Retourne ex. "VENDREDI · 12 SHA'BAN 1448"
  const weekday = date.toLocaleDateString('fr-FR', { weekday: 'long' }).toUpperCase()
  const hijri   = date.toLocaleDateString('fr-FR-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
  return `${weekday} · ${hijri}`
}
const formatCountdownHMS = (prayer: Prayer) => {
  const target = new Date(now)
  const [hours, minutes] = prayer.adhan.split(':').map(Number)
  target.setHours(hours, minutes, 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
  const hh = Math.floor(totalSeconds / 3600)
  const mm = Math.floor((totalSeconds % 3600) / 60)
  const ss = totalSeconds % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}
const formatPrayerCountdownLabel = (prayer: Prayer) => `${prayer.name} dans ${formatCountdownHMS(prayer)}`

const refreshDateUI = () => {
  const topDate = document.querySelector<HTMLElement>('.top-date')
  if (topDate) topDate.innerHTML = `${formatDate(now).toUpperCase()} <span>·</span> ${mosqueCity.toUpperCase()}`
  const dateChip = document.querySelector<HTMLElement>('.date-chip')
  if (dateChip) dateChip.innerHTML = formatDayAndMonth(now)
  const weekday = document.querySelector<HTMLElement>('.hero-arch .clock small')
  if (weekday) weekday.textContent = formatHijriShort(now)
}

const playSimulatedAudio = (mode: 'adhan' | 'iqamah' | 'announcement') => {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return
  const context = new AudioContextCtor()
  const addTone = (frequency: number, duration: number, volume: number, delay = 0) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.value = 0
    const startAt = context.currentTime + delay
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + duration)
  }
  if (mode === 'adhan') {
    addTone(660, 0.38, 0.08); addTone(660, 0.38, 0.08, 0.28); addTone(770, 0.52, 0.1, 0.56)
  } else if (mode === 'iqamah') {
    addTone(880, 0.24, 0.09); addTone(660, 0.28, 0.09, 0.18); addTone(540, 0.4, 0.08, 0.38)
  } else {
    addTone(520, 0.2, 0.06); addTone(620, 0.22, 0.07, 0.14); addTone(700, 0.26, 0.08, 0.34)
  }
  window.setTimeout(() => context.close(), 1200)
}

const triggerAdhanForPrayer = (prayer: Prayer) => {
  if (prayerEventLocks.adhan.has(prayer.name)) return
  prayerEventLocks.adhan.add(prayer.name)
  announcement = `C'est l'heure de l'Adhan pour la prière de ${prayer.name}`
  hostMode = 'adhan'; darkScreen = false; render()
  speak(`C'est l'heure de l'Adhan pour la prière de ${prayer.name}`)
  notifyMobile(`Adhan · ${prayer.name}`, `C'est l'heure de la prière de ${prayer.name}.`)
  playSimulatedAudio('adhan')
}

const triggerIqamahForPrayer = (prayer: Prayer) => {
  if (prayerEventLocks.iqamah.has(prayer.name)) return
  prayerEventLocks.iqamah.add(prayer.name)
  hostMode = 'warning'; darkScreen = false; render()
  speak('As-Salat ! Veuillez éteindre vos téléphones portables')
  notifyMobile(`Iqamah · ${prayer.name}`, 'As-Salat ! Veuillez éteindre vos téléphones portables.')
  playSimulatedAudio('iqamah')
  if (prayerWarningTimer) window.clearTimeout(prayerWarningTimer)
  prayerWarningTimer = window.setTimeout(() => {
    darkScreen = true; hostMode = 'prayer'; render()
    if (prayerCycleTimer) window.clearTimeout(prayerCycleTimer)
    const duration = prayerDurations[prayer.name] ?? maxPrayerMinutes
    prayerCycleTimer = window.setTimeout(() => { darkScreen = false; hostMode = 'idle'; render() }, duration * 60 * 1000)
  }, 2600)
}

// Diffuse une annonce sur l'écran public (texte affiché, et/ou lu à voix haute, ou audio enregistré)
const broadcastAnnouncement = (mode: AnnouncementMode, text: string, audioUrl: string | null) => {
  announcement = text || 'Annonce de la mosquée'
  hostMode = 'message'; darkScreen = false; render()
  notifyMobile('Nouvelle annonce', announcement)
  if (mode === 'voice' && audioUrl) {
    const audio = new Audio(audioUrl); void audio.play()
  } else if (mode === 'text-voice') {
    speak(text)
  } else {
    playSimulatedAudio('announcement')
  }
  const displayMs = Math.min(20000, Math.max(8000, announcement.length * 90))
  window.setTimeout(() => { if (hostMode === 'message') { hostMode = 'idle'; render() } }, displayMs)
}

// Retire automatiquement les annonces dont la durée en jours est écoulée
const pruneExpiredAnnouncements = () => {
  const todayMs = new Date(dateKey(now)).getTime()
  scheduledAnnouncements = scheduledAnnouncements.filter((item) => {
    const elapsedDays = Math.floor((todayMs - new Date(item.createdAt).getTime()) / 86400000)
    return elapsedDays < item.days
  })
}

// Vérifie chaque seconde si une annonce programmée doit se déclencher
const checkScheduledAnnouncements = () => {
  const todayKey = dateKey(now)
  if (announcementDayStamp !== todayKey) {
    announcementDayStamp = todayKey
    announcementTriggerLocks.clear()
    pruneExpiredAnnouncements()
  }
  if (now.getSeconds() !== 0) return
  const nowClock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  scheduledAnnouncements.forEach((item) => {
    if (!item.times.includes(nowClock)) return
    const lockKey = `${item.id}-${todayKey}-${nowClock}`
    if (announcementTriggerLocks.has(lockKey)) return
    announcementTriggerLocks.add(lockKey)
    broadcastAnnouncement(item.mode, item.text, item.audioUrl)
  })
}

const checkPrayerEvents = () => {
  const dayStamp = new Date().toDateString()
  if (prayerEventLocks.dayStamp !== dayStamp) {
    prayerEventLocks.dayStamp = dayStamp
    prayerEventLocks.adhan.clear()
    prayerEventLocks.iqamah.clear()
  }
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const currentSeconds = now.getSeconds()
  const dayOfWeek = now.getDay() // 5 = Friday
  
  prayers.forEach((prayer) => {
    // Le vendredi, ignorer Dhuhr car il est remplacé par Jumu'ah
    if (dayOfWeek === 5 && prayer.name === 'Dhuhr') return
    
    if (currentMinutes === toMinutes(prayer.adhan)  && currentSeconds === 0) triggerAdhanForPrayer(prayer)
    if (currentMinutes === toMinutes(prayer.iqamah) && currentSeconds === 0) triggerIqamahForPrayer(prayer)
  })
  
  // Le vendredi, déclencher les événements du Jumu'ah
  if (dayOfWeek === 5) {
    const jumuahMinutes = toMinutes(jumuahTime)
    if (currentMinutes === jumuahMinutes && currentSeconds === 0) {
      triggerAdhanForPrayer({ name: 'Jumu\'ah', arabic: 'الجمعة', adhan: jumuahTime, iqamah: jumuahTime, icon: '✦' })
    }
  }
}

const calendar = () => {
  const offset = (new Date(mobileCalendarDate.getFullYear(), mobileCalendarDate.getMonth(), 1).getDay() + 6) % 7
  const days   = new Date(mobileCalendarDate.getFullYear(), mobileCalendarDate.getMonth() + 1, 0).getDate()
  const cells  = Array.from({ length: offset + days }, (_, i) => i < offset ? '' : String(i - offset + 1))
  return cells.map((day) => {
    const date   = day ? new Date(mobileCalendarDate.getFullYear(), mobileCalendarDate.getMonth(), Number(day)) : undefined
    const events = date ? calendarEvents.get(dateKey(date)) || [] : []
    const labels = events.map((e) => e.label).join(' · ')
    const hasHoliday = events.some((e) => e.kind === 'holiday')
    const hasIslamic = events.some((e) => e.kind === 'islamic')
    const isToday = day && date && dateKey(date) === dateKey(now)
    return `<button class="day ${isToday ? 'today' : ''} ${hasHoliday ? 'holiday' : ''} ${hasIslamic ? 'islamic' : ''}" data-day="${day}" title="${labels}">${day}${hasHoliday ? '<span class="event-dot holiday-dot"></span>' : ''}${hasIslamic ? '<span class="event-dot islamic-dot"></span>' : ''}</button>`
  }).join('')
}

// ── Voix (annonces lues à voix haute — voix d'homme si disponible) ──
let cachedMaleVoice: SpeechSynthesisVoice | null | undefined
const pickFrenchMaleVoice = (): SpeechSynthesisVoice | null => {
  const voices = window.speechSynthesis?.getVoices() || []
  const french = voices.filter((v) => v.lang?.toLowerCase().startsWith('fr'))
  const maleHints = ['thomas', 'daniel', 'nicolas', 'paul', 'henri', 'guillaume', 'male', 'homme', 'man']
  return french.find((v) => maleHints.some((hint) => v.name.toLowerCase().includes(hint))) || french[0] || voices[0] || null
}
if (window.speechSynthesis) {
  window.speechSynthesis.addEventListener('voiceschanged', () => { cachedMaleVoice = pickFrenchMaleVoice() })
}
const speak = (text: string) => {
  if (!window.speechSynthesis) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'fr-FR'
  utterance.pitch = 0.8   // légèrement plus grave pour une voix d'homme posée
  utterance.rate = 0.96
  const voice = cachedMaleVoice ?? pickFrenchMaleVoice()
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
}
const notifyMobile = (_title: string, body: string) => {
  if (isMobileLayout() && 'Notification' in window && Notification.permission === 'granted') {
    const options: NotificationOptions & { vibrate?: number[] } = {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      vibrate: [200, 100, 200],
    }
    new Notification(mosqueName, options)
  }
}
const requestMobileNotifications = async () => {
  if (!('Notification' in window)) return
  const permission = await Notification.requestPermission()
  if (permission === 'granted') {
    const registration  = await navigator.serviceWorker.ready
    const configResponse = await fetch(`${apiBaseUrl}/mobile/push-config`)
    const config        = await configResponse.json() as { publicKey: string | null }
    if (!config.publicKey) return
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: config.publicKey })
    await fetch(`${apiBaseUrl}/mobile/mosques/${mosqueId}/push-subscriptions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) })
    new Notification(mosqueName, { body: `Notifications activées · prochaine prière : ${getNextPrayer().name}`, icon: '/icon.svg' })
  }
}
const openMosqueEmail = () => { window.location.href = `mailto:${mosqueEmail}?subject=${encodeURIComponent('Message pour ' + mosqueName)}` }
const openMosqueRoute = () => {
  window.open(mosqueLocationUrl, '_blank', 'noopener,noreferrer')
}
const shareMobileApp = async () => {
  if (navigator.share) await navigator.share({ title: mosqueName, text: 'Horaires et informations de la mosquée', url: window.location.href })
  else await navigator.clipboard?.writeText(window.location.href)
}
// Synchronise l'état partagé depuis le serveur (nom/ville, ticker, durées, annonces programmées) —
// c'est ce qui permet aux changements faits dans la régie admin d'apparaître sur les autres appareils.
type ServerAnnouncement = { id: string; mode: string; text: string; audioUrl: string | null; audioName: string | null; times: string[]; days: number; createdAt: string }
let settingsWriteVersion = 0
const patchMosqueSettings = async (settings: Record<string, unknown>) => {
  settingsWriteVersion += 1
  const response = await fetch(`${apiBaseUrl}/admin/mosques/${mosqueId}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!response.ok) throw new Error(`Échec de sauvegarde des réglages (${response.status})`)
  return await response.json() as Record<string, unknown>
}
const syncFromServer = async () => {
  const requestVersion = settingsWriteVersion
  try {
    const response = await fetch(`${apiBaseUrl}/public/dashboard?_=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return
    const dashboard = await response.json() as {
      name?: string; city?: string; contactEmail?: string; ticker?: string
      phone?: string; logoUrl?: string; imamName?: string; guideName?: string
      prayerTimes?: Array<{ name: string; arabic?: string; adhan: string; iqamah: string }>
      prayerDurations?: Record<string, number>
      notificationDelay?: number
      jumuahTime?: string
      announcements?: ServerAnnouncement[]
    }
    if (requestVersion !== settingsWriteVersion) return
    if (dashboard.contactEmail) mosqueEmail = dashboard.contactEmail
    // Ne pas écraser ce que l'admin est en train de taper dans son propre formulaire
    const identityFocused = document.activeElement?.id === 'mosque-name' || document.activeElement?.id === 'mosque-city' || document.activeElement?.id === 'mosque-phone' || document.activeElement?.id === 'imam-name'
    if (!identityFocused) {
      if (typeof dashboard.name === 'string') mosqueName = dashboard.name
      if (typeof dashboard.city === 'string') mosqueCity = dashboard.city
      if (typeof dashboard.phone === 'string') mosquePhone = dashboard.phone
      if (typeof dashboard.logoUrl === 'string') mosqueLogoUrl = dashboard.logoUrl
      const incomingImam = typeof dashboard.imamName === 'string' && dashboard.imamName.trim()
        ? dashboard.imamName.trim()
        : (typeof dashboard.guideName === 'string' && dashboard.guideName.trim()
          ? dashboard.guideName.trim()
          : (typeof dashboard.imamName === 'string' ? dashboard.imamName : (typeof dashboard.guideName === 'string' ? dashboard.guideName : undefined)))
      if (incomingImam !== undefined) {
        imamName = incomingImam
        try { localStorage.setItem('mosque-imam-name', incomingImam) } catch {}
      }
    }
    if (document.activeElement?.id !== 'ticker' && typeof dashboard.ticker === 'string') ticker = dashboard.ticker
    if (typeof dashboard.jumuahTime === 'string' && dashboard.jumuahTime) jumuahTime = dashboard.jumuahTime
    if (Array.isArray(dashboard.prayerTimes)) {
      dashboard.prayerTimes.forEach((serverPrayer) => {
        const prayer = prayers.find((item) => item.name === serverPrayer.name)
        if (prayer) {
          prayer.adhan = serverPrayer.adhan
          prayer.iqamah = serverPrayer.iqamah
        }
      })
      const chourouqEl = document.querySelector<HTMLElement>('.chourouq-hour')
      if (chourouqEl) chourouqEl.textContent = getChourouqTime()
    }
    if (dashboard.prayerDurations && typeof dashboard.prayerDurations === 'object') {
      Object.entries(dashboard.prayerDurations).forEach(([prayerName, minutes]) => {
        if (typeof minutes === 'number' && minutes > 0) prayerDurations[prayerName] = minutes
      })
    }
    if (typeof dashboard.notificationDelay === 'number' && dashboard.notificationDelay > 0) {
      notificationDelay = dashboard.notificationDelay
    }
    if (Array.isArray(dashboard.announcements)) {
      const todayMs = new Date(dateKey(now)).getTime()
      scheduledAnnouncements = dashboard.announcements
        .filter((item) => Math.floor((todayMs - new Date(item.createdAt).getTime()) / 86400000) < (item.days ?? 1))
        .map((item) => ({
          id: item.id,
          mode: (item.mode as AnnouncementMode) || 'text-display',
          text: item.text || '',
          audioUrl: item.audioUrl ? `${apiOrigin}${item.audioUrl}` : null,
          audioName: item.audioName || '',
          times: item.times || [],
          days: item.days ?? 1,
          createdAt: item.createdAt,
        }))
    }
    // Ne pas re-rendre pendant que l'admin est en train de saisir quelque chose (évite de lui faire perdre le focus/curseur)
    const activeTag = document.activeElement?.tagName
    const isEditingForm = activeTag === 'INPUT' || activeTag === 'TEXTAREA'
    const isAudioPlaying = Array.from(document.querySelectorAll<HTMLAudioElement>('audio')).some((audio) => !audio.paused && !audio.ended)
    if (!isEditingForm && !isAudioPlaying) render()
  } catch { /* backend indisponible — l'écran continue de fonctionner avec l'état local */ }
}

const app = document.querySelector<HTMLDivElement>('#app')!

const formatCountdown = (prayer: Prayer) => {
  return formatCountdownHMS(prayer)
}

const mobileEvents = () => [...calendarEvents.entries()]
  .filter(([date]) => date.startsWith(`${mobileCalendarDate.getFullYear()}-${String(mobileCalendarDate.getMonth() + 1).padStart(2, '0')}-`))
  .sort(([a], [b]) => a.localeCompare(b))
  .slice(0, 6)

const getQiblaBearing = (latitude: number, longitude: number) => {
  const meccaLatitude = 21.4225 * Math.PI / 180
  const meccaLongitude = 39.8262 * Math.PI / 180
  const userLatitude = latitude * Math.PI / 180
  const longitudeDelta = meccaLongitude - longitude * Math.PI / 180
  return (Math.atan2(Math.sin(longitudeDelta), Math.cos(userLatitude) * Math.tan(meccaLatitude) - Math.sin(userLatitude) * Math.cos(longitudeDelta)) * 180 / Math.PI + 360) % 360
}

const startQibla = () => {
  if (!navigator.geolocation) { qiblaLocation = 'error'; renderMobile(); return }
  qiblaLocation = 'loading'; renderMobile()
  navigator.geolocation?.getCurrentPosition((position) => {
    qiblaBearing = getQiblaBearing(position.coords.latitude, position.coords.longitude)
    qiblaLocation = 'ready'; renderMobile()
  }, () => { qiblaLocation = 'error'; renderMobile() }, { enableHighAccuracy: true, timeout: 10000 })
}

const bindQiblaOrientation = () => {
  if (qiblaListenerAttached || !('DeviceOrientationEvent' in window)) return
  window.addEventListener('deviceorientation', (event) => {
    const orientedEvent = event as DeviceOrientationEvent & { webkitCompassHeading?: number }
    const heading = orientedEvent.webkitCompassHeading ?? (typeof orientedEvent.alpha === 'number' ? 360 - orientedEvent.alpha : null)
    if (heading !== null) { qiblaHeading = heading; if (mobileView === 'services') renderMobile() }
  })
  qiblaListenerAttached = true
}

const requestQiblaOrientation = async () => {
  const orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
  if (typeof orientation.requestPermission === 'function') {
    try { await orientation.requestPermission() } catch { return }
  }
  bindQiblaOrientation()
}

const renderToolDetailView = () => {
  if (mobileToolView === 'tasbih') return '<section class="mobile-section tools-section tasbih-react-view"><div id="tasbih-react-root"></div></section>'
  const today = dateKey(now)
  const todayPrayers = trackedPrayers[today] || {}
  const prayedCount = trackedPrayerNames.filter((name) => todayPrayers[name]).length
  const prayerHistory = Object.keys(trackedPrayers).sort((a, b) => b.localeCompare(a)).slice(0, 7)
  const ramadanComplete = Object.values(trackedRamadan).filter(Boolean).length
  const ramadanDays = Array.from({ length: 30 }, (_, index) => index + 1)
  const ramadanDay = Math.min(30, Math.max(1, Math.floor((now.getTime() - new Date(now.getFullYear(), 2, 1).getTime()) / 86400000) + 1))
  const activeTasbih = tasbihState.items.find((item) => item.id === tasbihState.activeId) || tasbihState.items[0]
  const tasbihProgress = Math.min(100, Math.round((activeTasbih.count / activeTasbih.goal) * 100))
  const beads = Array.from({ length: 33 }, (_, index) => `<i class="tasbih-bead ${index < Math.ceil(tasbihProgress * 33 / 100) ? 'is-lit' : ''}" style="--bead-index: ${index};"></i>`).join('')
  const tasbihOptions = tasbihState.items.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === activeTasbih.id ? 'selected' : ''}>${escapeHtml(item.phrase)}</option>`).join('')
  const qiblaNeedle = qiblaBearing !== null && qiblaHeading !== null ? (qiblaBearing - qiblaHeading + 360) % 360 : qiblaBearing
  const detailClass = mobileToolView === 'list' ? '' : ` tool-detail tool-detail-${mobileToolView}`
  const backButton = mobileToolView === 'list' ? '' : '<button class="mobile-back tool-back" id="tools-back">← Mes outils</button>'
  return `<section class="mobile-section tools-section${detailClass}">${backButton}<span class="mobile-kicker">MES OUTILS</span><h1>${mobileToolView === 'list' ? 'Prendre soin<br><em>de ma pratique.</em>' : 'Un outil<br><em>à la fois.</em>'}</h1><div class="tool-stack">
    <article class="tool-card prayer-tracker-card" data-tool-card="prayers"><div class="tool-card-head"><div><span class="tool-icon"><i class="fas fa-check-double"></i></span><div><span class="mobile-kicker">AUJOURD'HUI · ${today}</span><h2>Suivi des prières</h2></div></div><strong>${prayedCount}/5</strong></div><div class="tool-prayer-list">${trackedPrayerNames.map((name) => `<button class="tool-prayer-row ${todayPrayers[name] ? 'is-done' : ''}" data-track-prayer="${name}"><span class="tool-check"><i class="fas fa-check"></i></span><span>${name}</span><small>${todayPrayers[name] ? 'J’ai prié' : 'À marquer'}</small></button>`).join('')}</div>${prayerHistory.length ? `<div class="tool-history"><span class="mobile-kicker">HISTORIQUE RÉCENT</span>${prayerHistory.map((date) => `<div><time>${new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</time><span>${trackedPrayerNames.map((name) => `<i class="${trackedPrayers[date]?.[name] ? 'done' : ''}" title="${name}"></i>`).join('')}</span><small>${trackedPrayerNames.filter((name) => trackedPrayers[date]?.[name]).length}/5</small></div>`).join('')}</div>` : ''}</article>
    <article class="tool-card ramadan-card"><div class="tool-card-head"><div><span class="tool-icon"><i class="fas fa-moon"></i></span><div><span class="mobile-kicker">PROGRESSION · ${ramadanComplete}/30</span><h2>Suivi du Ramadan</h2></div></div><strong>${Math.round((ramadanComplete / 30) * 100)}%</strong></div><p class="tool-helper">Marque chaque jour jeûné pour suivre ton mois.</p><div class="ramadan-grid">${ramadanDays.map((day) => `<button class="ramadan-day ${trackedRamadan[String(day)] ? 'is-done' : ''} ${day === ramadanDay ? 'is-current' : ''}" data-ramadan-day="${day}" aria-label="Jour ${day}">${day}</button>`).join('')}</div></article>
    <article class="tool-card tasbih-card"><div class="tool-card-head"><div><span class="tool-icon"><i class="fas fa-circle-notch"></i></span><div><span class="mobile-kicker">DHIKR</span><h2>Chapelet digital</h2></div></div><button class="tasbih-reset" id="tasbih-reset" aria-label="Réinitialiser"><i class="fas fa-rotate-left"></i></button></div><div class="tasbih-bead-ring" data-tasbih-ring role="button" tabindex="0" aria-label="Toucher le chapelet pour compter" style="--tasbih-rotation: ${tasbihRotation}deg">${beads}</div><div class="tasbih-counter"><strong>${activeTasbih.count}</strong><span>/ ${activeTasbih.goal}</span></div><div class="tasbih-progress"><i style="width: ${tasbihProgress}%"></i></div><div class="tasbih-actions"><label>Zikr<select id="tasbih-phrase" class="tasbih-select">${tasbihOptions}</select></label><label>Objectif<input id="tasbih-goal" class="tasbih-goal-input" type="number" min="1" step="1" value="${activeTasbih.goal}"></label></div><form class="custom-zikr-form" id="custom-zikr-form"><input id="custom-zikr-name" type="text" maxlength="40" placeholder="Nom d’un nouveau zikr" required><input id="custom-zikr-goal" type="number" min="1" step="1" placeholder="Objectif" required><button type="submit" aria-label="Ajouter le zikr"><i class="fas fa-plus"></i></button></form></article>
    <article class="tool-card qibla-card"><div class="tool-card-head"><div><span class="tool-icon"><i class="fas fa-compass"></i></span><div><span class="mobile-kicker">ORIENTATION</span><h2>Qibla</h2></div></div><strong>${qiblaBearing === null ? '—' : `${Math.round(qiblaBearing)}°`}</strong></div><div class="qibla-compass"><div class="qibla-dial"><span class="qibla-mark qibla-north">N</span><span class="qibla-mark qibla-east">E</span><span class="qibla-mark qibla-south">S</span><span class="qibla-mark qibla-west">O</span><i class="qibla-needle" style="transform: rotate(${qiblaNeedle ?? 0}deg)"></i><span class="qibla-kaaba"><i class="fas fa-kaaba"></i></span></div></div><p class="tool-helper">${qiblaLocation === 'loading' ? 'Recherche de votre position…' : qiblaLocation === 'error' ? 'Position indisponible. Autorisez la géolocalisation puis réessayez.' : qiblaBearing === null ? 'Utilisez votre position pour calculer la direction de La Mecque.' : qiblaHeading === null ? 'Tournez votre téléphone pour activer la boussole.' : 'L’aiguille indique la direction de La Mecque.'}</p><button class="qibla-locate" id="qibla-locate"><i class="fas fa-location-crosshairs"></i> Utiliser ma position</button></article>
  </div></section>`
}

const renderQuranView = () => {
  if (quranOpenSurah) {
    const surah = quranSurahs.find((s) => s.number === quranOpenSurah)
    const body = quranAyahsLoading
      ? '<p class="mobile-intro">Chargement de la sourate...</p>'
      : quranAyahsError
      ? '<p class="mobile-intro">Impossible de charger cette sourate. Vérifiez votre connexion puis réessayez.</p><button class="mobile-retry" id="quran-retry-surah">Réessayer</button>'
      : `<div class="quran-ayahs">${quranAyahs.map((ayah) => `<article class="quran-ayah"><span class="quran-ayah-number">${ayah.numberInSurah}</span><p class="quran-arabic" dir="rtl">${ayah.arabic}</p><p class="quran-translation">${ayah.translation}</p></article>`).join('')}</div>`
    return `<section class="mobile-section quran-reader"><button class="mobile-back" id="quran-back">← Mes sourates</button><span class="mobile-kicker">SOURATE ${quranOpenSurah}</span><h1>${surah?.englishName || ''}<br><em>${surah?.englishNameTranslation || ''}</em></h1><p class="mobile-intro">${surah?.numberOfAyahs || ''} versets · ${surah?.revelationType === 'Meccan' ? 'Mecquoise' : 'Médinoise'}</p>${body}</section>`
  }

  const body = quranSurahsLoading
    ? '<p class="mobile-intro">Chargement des 114 sourates...</p>'
    : quranSurahsError
    ? '<p class="mobile-intro">Le Coran n\'a pas pu être chargé. Vérifiez votre connexion puis réessayez.</p><button class="mobile-retry" id="quran-retry-list">Réessayer</button>'
    : `<div class="quran-surah-list">${quranSurahs.map((surah) => `<div class="quran-surah-row" data-surah="${surah.number}" role="button" tabindex="0"><span class="quran-surah-index">${surah.number}</span><div><strong>${surah.englishName}</strong><small>${surah.englishNameTranslation} · ${surah.numberOfAyahs} versets</small><audio controls preload="none" data-surah="${surah.number}" src="${quranAudioUrl(surah.number)}" aria-label="Écouter ${surah.englishName}"></audio></div><span class="quran-surah-arabic">${surah.name}</span></div>`).join('')}</div>`
  return `<section class="mobile-section"><span class="mobile-kicker">LE SAINT CORAN</span><h1>Lire<br><em>le Coran.</em></h1><p class="mobile-intro">Les 114 sourates, en arabe avec traduction française.</p>${body}</section>`
}

const renderToolsView = () => {
  if (mobileToolView !== 'list') return renderToolDetailView()
  return `<section class="mobile-section tools-section"><span class="mobile-kicker">MES OUTILS</span><h1>Prendre soin<br><em>de ma pratique.</em></h1><div class="tool-index">
    <button class="tool-index-card" data-tool-view="prayers"><span class="tool-icon"><i class="fas fa-check-double"></i></span><span><strong>Suivi des prières</strong><small>Marquer les cinq prières et voir l’historique.</small></span><b>→</b></button>
    <button class="tool-index-card" data-tool-view="ramadan"><span class="tool-icon"><i class="fas fa-moon"></i></span><span><strong>Suivi du Ramadan</strong><small>Visualiser les jours jeûnés et la progression.</small></span><b>→</b></button>
    <button class="tool-index-card" data-tool-view="tasbih"><span class="tool-icon"><i class="fas fa-circle-notch"></i></span><span><strong>Chapelet digital</strong><small>Compter chaque zikr avec des perles visuelles.</small></span><b>→</b></button>
    <button class="tool-index-card" data-tool-view="qibla"><span class="tool-icon"><i class="fas fa-compass"></i></span><span><strong>Qibla</strong><small>Calculer la direction de La Mecque.</small></span><b>→</b></button>
  </div></section>`
}

const discoverTabs: Array<{ id: DiscoverTopic; label: string }> = [
  { id: 'seerah', label: 'Vie du Prophète ﷺ' },
  { id: 'piliers', label: "Piliers de l'islam" },
  { id: 'adab', label: 'Adab au quotidien' },
  { id: 'duas', label: 'Du’as' },
]
const renderDiscoverView = () => {
  const tabs = `<div class="discover-tabs">${discoverTabs.map((tab) => `<button class="${discoverTopic === tab.id ? 'active' : ''}" data-discover-tab="${tab.id}">${tab.label}</button>`).join('')}</div>`
  const body = discoverTopic === 'seerah'
    ? `<div class="seerah-timeline">${seerahMilestones.map((m) => `<article class="seerah-item"><time>${m.period}</time><h3>${m.title}</h3><p>${m.text}</p></article>`).join('')}</div>`
    : discoverTopic === 'piliers'
    ? `<div class="pillar-list">${pillarsOfIslam.map((p, i) => `<article class="pillar-item"><span class="pillar-index">${i + 1}</span><div><strong>${p.title}</strong><small>${p.subtitle}</small><p>${p.text}</p></div></article>`).join('')}</div>`
    : discoverTopic === 'adab'
    ? `<div class="adab-list">${dailyAdab.map((a) => `<article class="adab-item"><h3>${a.title}</h3><p>${a.text}</p></article>`).join('')}</div>`
    : `<div class="dua-list">${dailyDuas.map((dua) => `<article class="dua-item"><h3>${dua.title}</h3><p class="dua-arabic" dir="rtl">${dua.arabic}</p><p class="dua-transliteration">${dua.transliteration}</p><p>${dua.text}</p></article>`).join('')}</div>`
  return `<section class="mobile-section"><span class="mobile-kicker">DÉCOUVRIR L'ISLAM</span><h1>Grandir<br><em>dans la foi.</em></h1>${tabs}${body}</section>`
}

const renderMobile = () => {
  tasbihReactRoot?.unmount()
  tasbihReactRoot = null
  if (darkScreen) {
    app.innerHTML = `<div class="mobile-prayer-companion"><span class="mobile-companion-symbol">م</span><span class="mobile-kicker">MOMENT DE PRIÈRE</span><h1>As-Salat.</h1><p>Votre smartphone est-il<br>en mode silencieux ?</p><strong>📵</strong><small>La mosquée retrouvera sa lumière dans quelques instants.</small></div>`
    return
  }
  const nextPrayer = getNextPrayer()
  const eventRows  = mobileEvents()
  const content = mobileView === 'quran'
    ? renderQuranView()
    : mobileView === 'discover'
    ? renderDiscoverView()
    : mobileView === 'services'
    ? renderToolsView()
    : mobileView === 'prayers'
    ? `<section class="mobile-section"><span class="mobile-kicker">HORAIRES EN DIRECT</span><h1>Les temps<br><em>de prière.</em></h1><div class="mobile-prayer-list">${prayers.map((p) => `<article class="mobile-prayer ${p.name === nextPrayer.name ? 'is-next' : ''}"><span class="mobile-prayer-icon">${p.icon}</span><div><strong>${p.name}</strong><small>${p.arabic}</small></div><div class="mobile-times"><span>ADHAN <b>${p.adhan}</b></span><span>IQAMAH <b>${p.iqamah}</b></span></div></article>`).join('')}</div></section>`
    : mobileView === 'calendar'
    ? `<section class="mobile-section"><span class="mobile-kicker">CALENDRIER DU SYSTÈME</span><h1>Les dates<br><em>importantes.</em></h1><p class="mobile-intro">Jours fériés et événements musulmans synchronisés automatiquement.</p><div class="mobile-calendar-container"><div class="mobile-calendar-header"><button id="prev-month" class="calendar-nav-btn"><i class="fas fa-chevron-left"></i></button><span class="calendar-month-title">${monthNames[mobileCalendarDate.getMonth()]} ${mobileCalendarDate.getFullYear()}</span><button id="next-month" class="calendar-nav-btn"><i class="fas fa-chevron-right"></i></button></div><div class="mobile-weekdays"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="mobile-calendar-days">${calendar()}</div></div><div class="mobile-events">${eventRows.length ? eventRows.map(([date, items]) => `<article><time>${new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</time><div>${items.map((item) => `<strong>${item.label}</strong><small>${item.kind === 'holiday' ? 'Jour chômé' : 'Événement musulman'}</small>`).join('')}</div></article>`).join('') : '<p class="mobile-intro">Synchronisation du calendrier en cours...</p>'}</div></section>`
    : `<section class="mobile-home"><div class="mobile-hero-section"><div class="hero-content"><span class="mobile-kicker">${formatWeekday(now)}</span><h1>Assalamu<br><em>Alaykum</em></h1><p>Bienvenue à ${mosqueName}</p></div></div><div class="prayer-timeline"><div class="timeline-scroll">${prayers.map((p) => `<div class="prayer-item ${p.name === nextPrayer.name ? 'active' : ''}"><span class="prayer-icon">${p.icon}</span><div class="prayer-details"><strong>${p.name}</strong><small>${p.arabic}</small></div><div class="prayer-times-detail"><div class="time-row"><span class="time-label">ADHAN</span><span class="time-value">${p.adhan}</span></div><div class="time-row"><span class="time-label">IQAMAH</span><span class="time-value">${p.iqamah}</span></div></div></div>`).join('')}</div></div><article class="mobile-jumuah"><span class="jumuah-mark" aria-hidden="true">✦</span><div><span class="mobile-kicker">PRIÈRE DU VENDREDI</span><strong>Jumu'ah</strong><span class="jumuah-time">${jumuahTime} · Grande salle</span></div><span class="gold-arrow" aria-hidden="true">↗</span></article><div class="next-prayer-highlight"><div class="highlight-content"><span class="highlight-label">PROCHAINE PRIÈRE</span><h2>${nextPrayer.name}</h2><div class="countdown-container"><span class="countdown-time">${formatCountdown(nextPrayer)}</span><span class="countdown-label">min restantes</span></div></div><div class="highlight-icon"><i class="fas fa-mosque"></i></div></div><div class="quick-actions-grid"><button data-mobile-view="prayers" class="action-card"><i class="fas fa-sun"></i><span>Prières</span></button><button data-mobile-view="calendar" class="action-card"><i class="fas fa-calendar-alt"></i><span>Calendrier</span></button><button data-mobile-view="quran" class="action-card"><i class="fas fa-moon"></i><span>Coran</span></button><button data-mobile-view="discover" class="action-card"><i class="fas fa-star"></i><span>Découvrir</span></button></div><div class="daily-message"><div class="message-header"><i class="fas fa-bullhorn"></i><span>Message du jour</span></div><p>${announcement}</p></div></section>`

  app.innerHTML = `<div class="mobile-app"><header class="mobile-header"><button class="mobile-brand" data-mobile-view="home">${mosqueLogoUrl ? `<img src="${mosqueLogoUrl}" alt="${mosqueName}" class="mobile-logo-img">` : '<span>م</span>'}<div class="brand-name"><strong>${mosqueName}</strong><small>${mosqueCity}, Mali</small></div></button><time id="mobile-clock">${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time><button class="mobile-bell" id="mobile-notification-header" aria-label="Notifications"><i class="fas fa-bell ${scheduledAnnouncements.length > 0 ? 'animated-bell has-notification' : ''}"></i></button></header><main>${content}</main><footer class="mobile-developer-credit">Application développée par GDA Mali</footer><nav class="mobile-nav"><button class="${mobileView === 'home' ? 'active' : ''}" data-mobile-view="home"><i class="fas fa-home"></i><small>Accueil</small></button><button class="${mobileView === 'prayers' ? 'active' : ''}" data-mobile-view="prayers"><i class="fas fa-sun"></i><small>Prières</small></button><button class="${mobileView === 'calendar' ? 'active' : ''}" data-mobile-view="calendar"><i class="fas fa-calendar-alt"></i><small>Calendrier</small></button><button class="${mobileView === 'quran' ? 'active' : ''}" data-mobile-view="quran"><i class="fas fa-moon"></i><small>Coran</small></button><button class="${mobileView === 'discover' ? 'active' : ''}" data-mobile-view="discover"><i class="fas fa-star"></i><small>Découvrir</small></button>${mobileToolView === 'list' ? `<button class="${mobileView === 'services' ? 'active' : ''}" data-mobile-view="services"><i class="fas fa-ellipsis-h"></i><small>Mes outils</small></button>` : ''}</nav></div>`

  if (mobileView === 'services' && mobileToolView === 'tasbih') {
    const rootElement = document.querySelector<HTMLDivElement>('#tasbih-react-root')
    if (rootElement) {
      const initialDhikrs = tasbihState.items.map((item) => ({ id: item.id, name: item.phrase, target: item.goal }))
      tasbihReactRoot = createRoot(rootElement)
      tasbihReactRoot.render(React.createElement(TasbihCounter, {
        initialDhikrs,
        persistedState: getTasbihReactState(),
        onBack: () => { mobileToolView = 'list'; renderMobile() },
        onPersist: (state: { activeDhikrId: string; count: number; loop: number; beadStyle: string; soundOn: boolean; dhikrs: Array<{ id: string; name: string; target: number }> }) => {
          tasbihState = {
            activeId: state.activeDhikrId,
            loop: state.loop,
            beadStyle: state.beadStyle,
            soundOn: state.soundOn,
            items: state.dhikrs.map((item) => ({ id: item.id, phrase: item.name, count: item.id === state.activeDhikrId ? state.count : (tasbihState.items.find((saved) => saved.id === item.id)?.count || 0), goal: item.target, custom: item.id.startsWith('custom-') })),
          }
          saveMobileTool('mosque-mobile-tasbih', tasbihState)
        },
      }))
    }
  }

  if (mobileView === 'home') {
    const main = document.querySelector('main')
    main?.insertAdjacentHTML('beforeend', `<section class="home-additional-content"><div class="mosque-info-card"><i class="fas fa-map-marker-alt"></i><div><strong>${mosqueName}</strong><small>${mosqueCity}, Mali</small></div></div><div class="contact-actions"><button id="mobile-call" class="contact-btn"><i class="fas fa-phone"></i><span>Appeler</span></button><button id="mobile-route-home" class="contact-btn"><i class="fas fa-directions"></i><span>Itinéraire</span></button><button id="mobile-share" class="contact-btn"><i class="fas fa-share-alt"></i><span>Partager</span></button></div></section>`)
  }
  document.querySelectorAll<HTMLButtonElement>('[data-mobile-view]').forEach((btn) => btn.onclick = () => {
    mobileView = btn.dataset.mobileView as typeof mobileView
    if (mobileView === 'quran') { quranOpenSurah = null; void loadQuranSurahs() }
    renderMobile()
  })
  const toolsNavButton = document.querySelector<HTMLButtonElement>('[data-mobile-view="services"]')
  if (toolsNavButton) {
    const label = toolsNavButton.querySelector('small')
    if (label) label.textContent = 'Mes outils'
  }
  attachQuranAudioGuard()
  document.querySelectorAll<HTMLButtonElement>('[data-tool-view]').forEach((button) => button.onclick = () => {
    mobileToolView = button.dataset.toolView as ToolView
    renderMobile()
  })
  document.querySelector<HTMLButtonElement>('#tools-back')?.addEventListener('click', () => {
    mobileToolView = 'list'
    renderMobile()
  })
  document.querySelectorAll<HTMLButtonElement>('[data-track-prayer]').forEach((button) => button.onclick = () => {
    const name = button.dataset.trackPrayer || ''
    const today = dateKey(now)
    trackedPrayers[today] = { ...(trackedPrayers[today] || {}), [name]: !trackedPrayers[today]?.[name] }
    saveMobileTool('mosque-mobile-prayers', trackedPrayers)
    renderMobile()
  })
  document.querySelectorAll<HTMLButtonElement>('[data-ramadan-day]').forEach((button) => button.onclick = () => {
    const day = button.dataset.ramadanDay || ''
    trackedRamadan[day] = !trackedRamadan[day]
    saveMobileTool('mosque-mobile-ramadan', trackedRamadan)
    renderMobile()
  })
  const countTasbih = () => {
    const active = tasbihState.items.find((item) => item.id === tasbihState.activeId)
    if (!active) return
    tasbihState = { ...tasbihState, items: tasbihState.items.map((item) => item.id === active.id ? { ...item, count: item.count + 1 } : item) }
    tasbihRotation += 12
    playTasbihClick()
    saveMobileTool('mosque-mobile-tasbih', tasbihState)
    renderMobile()
  }
  const tasbihRing = document.querySelector<HTMLElement>('[data-tasbih-ring]')
  tasbihRing?.addEventListener('click', countTasbih)
  tasbihRing?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      countTasbih()
    }
  })
  document.querySelector<HTMLButtonElement>('#tasbih-reset')?.addEventListener('click', () => {
    tasbihState = { ...tasbihState, items: tasbihState.items.map((item) => item.id === tasbihState.activeId ? { ...item, count: 0 } : item) }
    saveMobileTool('mosque-mobile-tasbih', tasbihState)
    renderMobile()
  })
  document.querySelector<HTMLSelectElement>('#tasbih-phrase')?.addEventListener('change', (event) => {
    tasbihState = { ...tasbihState, activeId: (event.target as HTMLSelectElement).value }
    saveMobileTool('mosque-mobile-tasbih', tasbihState)
    renderMobile()
  })
  document.querySelector<HTMLInputElement>('#tasbih-goal')?.addEventListener('change', (event) => {
    const goal = Math.max(1, Number((event.target as HTMLInputElement).value) || 1)
    tasbihState = { ...tasbihState, items: tasbihState.items.map((item) => item.id === tasbihState.activeId ? { ...item, goal } : item) }
    saveMobileTool('mosque-mobile-tasbih', tasbihState)
    renderMobile()
  })
  document.querySelector<HTMLFormElement>('#custom-zikr-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const nameInput = document.querySelector<HTMLInputElement>('#custom-zikr-name')
    const goalInput = document.querySelector<HTMLInputElement>('#custom-zikr-goal')
    const phrase = nameInput?.value.trim() || ''
    const goal = Math.max(1, Number(goalInput?.value) || 1)
    if (!phrase) return
    const id = `custom-${Date.now()}`
    tasbihState = { activeId: id, items: [...tasbihState.items, { id, phrase, count: 0, goal, custom: true }] }
    saveMobileTool('mosque-mobile-tasbih', tasbihState)
    renderMobile()
  })
  document.querySelector<HTMLButtonElement>('#qibla-locate')?.addEventListener('click', () => {
    void requestQiblaOrientation().then(startQibla)
  })
  document.querySelectorAll<HTMLElement>('.quran-surah-row').forEach((btn) => {
    btn.onclick = (event) => {
      if ((event.target as HTMLElement).closest('audio')) return
      void loadQuranSurah(Number(btn.dataset.surah))
    }
    btn.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') void loadQuranSurah(Number(btn.dataset.surah))
    }
  })
  document.querySelector<HTMLButtonElement>('#quran-back')?.addEventListener('click', () => { quranOpenSurah = null; renderMobile() })
  document.querySelector<HTMLButtonElement>('#quran-retry-list')?.addEventListener('click', () => { quranSurahs = []; void loadQuranSurahs() })
  document.querySelector<HTMLButtonElement>('#quran-retry-surah')?.addEventListener('click', () => { if (quranOpenSurah) void loadQuranSurah(quranOpenSurah) })
  document.querySelectorAll<HTMLButtonElement>('[data-discover-tab]').forEach((btn) => btn.onclick = () => { discoverTopic = btn.dataset.discoverTab as DiscoverTopic; renderMobile() })
  document.querySelector<HTMLButtonElement>('#mobile-speak')?.addEventListener('click', () => speak(announcement))
  document.querySelectorAll<HTMLButtonElement>('#mobile-notification-header, #mobile-notifications').forEach((btn) => btn.addEventListener('click', () => void requestMobileNotifications()))
  document.querySelector<HTMLButtonElement>('#mobile-email')?.addEventListener('click', openMosqueEmail)
  document.querySelector<HTMLButtonElement>('#mobile-route')?.addEventListener('click', openMosqueRoute)
  document.querySelector<HTMLButtonElement>('#mobile-call')?.addEventListener('click', () => { window.location.href = `tel:${mosquePhone || '+224620000000'}` })
  document.querySelector<HTMLButtonElement>('#mobile-route-home')?.addEventListener('click', openMosqueRoute)
  document.querySelector<HTMLButtonElement>('#mobile-share')?.addEventListener('click', () => void shareMobileApp())
  
  // Calendar navigation
  document.querySelector<HTMLButtonElement>('#prev-month')?.addEventListener('click', () => {
    mobileCalendarDate.setMonth(mobileCalendarDate.getMonth() - 1)
    void loadCalendarEvents()
    renderMobile()
  })
  document.querySelector<HTMLButtonElement>('#next-month')?.addEventListener('click', () => {
    mobileCalendarDate.setMonth(mobileCalendarDate.getMonth() + 1)
    void loadCalendarEvents()
    renderMobile()
  })
}

// ── SVG ornement mosquée (original, fidèle à l'image) ───────────
const mosqueSVG = `<svg viewBox="0 0 420 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="var(--wine)" stroke-width="2">
    <!-- Minaret gauche : corps + crossbar + flèche + tige + capuchon -->
    <path d="M102 162V77"/>
    <path d="M83 77h38"/>
    <path d="M94 77l8-18 8 18"/>
    <path d="M100 59V42"/>
    <path d="M96 42h8"/>
    <!-- Minaret droit -->
    <path d="M318 162V77"/>
    <path d="M299 77h38"/>
    <path d="M310 77l8-18 8 18"/>
    <path d="M316 59V42"/>
    <path d="M312 42h8"/>
  </g>
  <!-- Grand arc principal (rempli léger) -->
  <path d="M142 162v-38c0-28 30-52 68-52s68 24 68 52v38Z" fill="var(--wine)" opacity=".10"/>
  <!-- Contour arc extérieur -->
  <path d="M136 162v-38c0-31 33-57 74-57s74 26 74 57v38" fill="none" stroke="var(--wine)" stroke-width="2"/>
  <!-- Dôme central (bordeaux prononcé) -->
  <path d="M184 91c4-28 16-44 26-51 10 7 22 23 26 51" fill="var(--wine)" opacity=".80"/>
  <!-- Fleuron doré -->
  <path d="M210 33V22M205 22h10" stroke="var(--gold)" stroke-width="2"/>
  <!-- Colonnes dorées -->
  <path d="M166 162v-37M254 162v-37M201 162v-46M219 162v-46" stroke="var(--gold)" stroke-width="3"/>
  <!-- Petites arches dorées -->
  <path d="M159 125q7-13 14 0v16h-14z" fill="var(--gold)" opacity=".9"/>
  <path d="M247 125q7-13 14 0v16h-14z" fill="var(--gold)" opacity=".9"/>
  <path d="M202 116q8-15 16 0v20h-16z" fill="var(--gold)" opacity=".9"/>
  <!-- Point doré sur le dôme -->
  <circle cx="210" cy="74" r="4" fill="var(--gold)"/>
</svg>`

const render = () => {
  document.body.classList.toggle('mobile-mode', isMobileLayout())
  if (isMobileLayout()) { renderMobile(); return }
  document.body.classList.toggle('admin-mode', activeView === 'admin')
  document.documentElement.classList.toggle('admin-mode', activeView === 'admin')

  // Heure formatée en temps réel
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const nextPrayer = getNextPrayer()

  const welcomeTitleSize = Math.max(30, Math.min(68, 68 - Math.max(0, mosqueName.trim().length - 16) * 2.8))
  app.innerHTML = `<div class="app-shell ${darkScreen ? 'prayer-mode' : ''} ${activeView === 'admin' ? 'admin-shell' : ''}">
    <header class="topbar">
      <div class="brand-mark">م</div>
      <div class="brand-copy">
        <span class="eyebrow">MOSQUÉE CONNECTÉE</span>
        <strong>${mosqueName}</strong>
      </div>
      <div class="top-date">${formatDate(now).toUpperCase()} <span>·</span> ${mosqueCity.toUpperCase()}</div>
      ${isAdminApp
        ? '<div class="admin-label">RÉGIE PRIVÉE</div>'
        : '<div class="live"><i></i> EN DIRECT</div>'
      }
    </header>

    <main class="${activeView === 'home' ? '' : 'hidden'}">
      <section class="command-grid">
        <!-- Colonne de gauche (large) : tout le contenu -->
        <section class="prayer-column">
          <div class="welcome-section">
            <div class="welcome-copy" style="--welcome-title-size: ${welcomeTitleSize}px">
              <span class="eyebrow">ASSALAMU ALAIKUM</span>
              <h1>Bienvenue dans<br><em>${mosqueName}</em></h1>
              <p>Que cette journée vous apporte paix, lumière et sérénité.</p>
            </div>
            <div class="clock-inline">
              <div class="clock">
                <span id="clock">${timeStr}</span>
                <small>${formatHijriShort(now)}</small>
                <div class="clock-countdown" id="public-countdown">${formatPrayerCountdownLabel(nextPrayer)}</div>
              </div>
            </div>
          </div>
          <div class="section-heading">
            <div>
              <span class="eyebrow">LES TEMPS SACRÉS</span>
              <h2>Adhan <i>&</i> Iqamah</h2>
            </div>
            <span class="date-chip">${formatDayAndMonth(now)}</span>
          </div>
          <div class="prayer-list">
            ${prayers.map((prayer, index) => {
              return `
              <article class="prayer-card ${index === 1 ? 'next' : ''}">
                <div class="prayer-top">
                  <span class="prayer-icon">${prayer.icon}</span>
                  ${index === 1 ? '<b class="next-label">PROCHAINE</b>' : ''}
                </div>
                <div class="prayer-name">
                  <strong>${prayer.name}</strong>
                  <span>${prayer.arabic}</span>
                </div>
                <div class="time-pair">
                  <div><small>ADHAN</small><time>${prayer.adhan || '--:--'}</time></div>
                  <div><small>IQAMAH</small><time>${prayer.iqamah || '--:--'}</time></div>
                </div>
              </article>`
            }).join('')}
          </div>
          <div class="special-prayers-row">
            <div class="jumuah">
              <span class="jumuah-mark" aria-hidden="true">✦</span>
              <div>
                <span class="eyebrow">PRIÈRE DU VENDREDI</span>
                <strong>Jumu'ah</strong>
                <span class="jumuah-time">Grande salle</span>
              </div>
              <time class="special-hour">${jumuahTime}</time>
            </div>
            <div class="chourouq">
              <span class="chourouq-mark" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v4M4.93 10.93l2.83-2.83M19.07 10.93l-2.83-2.83M2 18h20M12 10a6 6 0 0 1 6 6H6a6 6 0 0 1 6-6z"/>
                </svg>
              </span>
              <div>
                <span class="eyebrow">LEVER DU SOLEIL</span>
                <strong>Chourouq</strong>
                <span class="chourouq-sub">Fin du Fajr</span>
              </div>
              <time class="special-hour chourouq-hour">${getChourouqTime()}</time>
            </div>
          </div>
          <div class="public-scan-card">
            ${hasMobileAppUrl
              ? `<img src="${qrDownloadUrl}" alt="QR code de l'application mobile" width="88" height="88">`
              : `<div class="scan-card-missing">⚠</div>`}
            <div>
              <span class="eyebrow">APPLICATION MOBILE</span>
              <strong>Emportez la mosquée avec vous</strong>
              <small>${hasMobileAppUrl
                ? 'Coran complet, vie du Prophète ﷺ et adab au quotidien — scannez pour ouvrir depuis votre téléphone.'
                : "Configurez VITE_PUBLIC_HOST (ou VITE_PUBLIC_URL en production) dans le fichier .env pour activer le QR code."}</small>
            </div>
          </div>
        </section>

        <!-- Colonne de droite (étroite) : illustration + calendrier -->
        <section class="right-column">
          <div class="arch-line"><div class="mosque-ornament" aria-hidden="true">${mosqueSVG}</div></div>
          <div class="calendar-panel">
            <div class="calendar-head">
              <div>
                <span class="eyebrow">LE CALENDRIER</span>
                <h2>${monthNames[now.getMonth()]} <span>${now.getFullYear()}</span></h2>
              </div>
              <div class="month-arrows">‹　›</div>
            </div>
            <div class="calendar-meta">
              <span>Grégorien</span>
              <span>Hégirien · ${now.toLocaleDateString('fr-FR-u-ca-islamic', { year: 'numeric' })}</span>
            </div>
            <div class="weekdays">
              <span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>
            </div>
            <div class="days">${calendar()}</div>
            <div class="calendar-note">
              <span><b class="dot today-dot"></b> Aujourd'hui</span>
              <span><b class="dot holiday-dot"></b> Jour chômé</span>
            </div>
          </div>
          ${imamName.trim() ? `
          <div class="imam-welcome-card">
            <span class="imam-welcome-icon" aria-hidden="true">☽</span>
            <div class="imam-welcome-text">
              <strong>Imam ${escapeHtml(imamName.trim().replace(/^imam\s+/i, ''))}</strong>
              <span>Vous souhaite la bienvenue dans notre mosquée.</span>
            </div>
          </div>` : ''}
        </section>
      </section>
    </main>

    <!-- Vue admin -->
    <section class="admin-view ${activeView === 'admin' ? '' : 'hidden'}">
      <div class="admin-heading">
        <div>
          <span class="eyebrow">CENTRE DE CONTRÔLE · ADMINISTRATEUR</span>
          <h1>Tout est prêt<br><em>pour aujourd'hui.</em></h1>
        </div>
        <span class="admin-state"><i></i> Système opérationnel</span>
      </div>
      <div class="admin-grid">
        <section class="settings-panel identity-panel">
          <div class="panel-title">
            <div><span class="eyebrow">IDENTITÉ</span><h2>Nom de la mosquée</h2></div>
            <button class="save-btn" id="save-identity">Enregistrer</button>
          </div>
          <p class="panel-help">Ces informations s'affichent automatiquement sur les écrans connectés.</p>
          <label class="identity-field"><span class="eyebrow">NOM</span><input type="text" id="mosque-name" value="${mosqueName}"></label>
          <label class="identity-field"><span class="eyebrow">NOM DE L'IMAM</span><input type="text" id="imam-name" value="${imamName}" placeholder="Ex: Abdoulaye"></label>
          <label class="identity-field"><span class="eyebrow">VILLE</span><input type="text" id="mosque-city" value="${mosqueCity}"></label>
          <label class="identity-field"><span class="eyebrow">TÉLÉPHONE</span><input type="tel" id="mosque-phone" value="${mosquePhone}" placeholder="+224 000 000 000"></label>
          <label class="identity-field"><span class="eyebrow">LOGO</span><input class="file-input" id="mosque-logo" type="file" accept="image/*"></label>
          ${mosqueLogoUrl ? `<div class="logo-preview"><img src="${mosqueLogoUrl}" alt="Logo" width="64" height="64"><button type="button" id="remove-logo" class="remove-logo-btn">Retirer</button></div>` : ''}
        </section>
        <section class="settings-panel schedule-panel">
          <div class="panel-title">
            <div><span class="eyebrow">HORAIRES</span><h2>Planning des prières</h2></div>
            <button class="save-btn" id="save-schedule">Enregistrer</button>
          </div>
          <div class="admin-table">
            <div class="table-head"><span>PRIÈRE</span><span>ADHAN</span><span>IQAMAH</span></div>
            ${prayers.map((prayer) => `
              <label class="setting-row">
                <span><b>${prayer.name}</b><small>${prayer.arabic}</small></span>
                <input type="time" value="${prayer.adhan}">
                <input type="time" value="${prayer.iqamah}">
              </label>`).join('')}
          </div>
          <label class="setting-row">
            <span><b>Jumu'ah</b><small>الجمعة (vendredi)</small></span>
            <input type="time" id="jumuah-time" value="${jumuahTime}">
          </label>
          <label class="setting-row">
            <span><b>Chourouq</b><small>الشروق (lever du soleil)</small></span>
            <input type="time" id="chourouq-time" value="${getChourouqTime()}">
          </label>
        </section>
        <section class="settings-panel broadcast-panel">
          <div class="panel-title">
            <div><span class="eyebrow">DIFFUSION</span><h2>Annonce de la mosquée</h2></div>
            <span class="record-dot">●</span>
          </div>
          <p class="panel-help">Écrivez un texte (à afficher ou à lire à voix haute), ou enregistrez/téléversez directement un message vocal — les deux ne sont pas cumulables.</p>
          <textarea id="announcement" placeholder="Écrivez le message à diffuser..." ${customAudioUrl ? 'disabled' : ''}>${draftText}</textarea>
          ${customAudioUrl ? `
            <div class="voice-ready-line"><span><i class="fas fa-microphone"></i> ${audioName || 'Message vocal prêt'}</span><button type="button" id="clear-voice" class="remove-voice-btn">Retirer</button></div>
          ` : `
            <div class="mode-toggle" role="group" aria-label="Mode de diffusion du texte">
              <button type="button" class="${draftMode === 'text-display' ? 'active' : ''}" data-mode="text-display"><i class="fas fa-eye"></i> Afficher en texte</button>
              <button type="button" class="${draftMode === 'text-voice' ? 'active' : ''}" data-mode="text-voice"><i class="fas fa-volume-up"></i> Lire à voix haute</button>
            </div>
            <input class="file-input" id="audio-file" type="file" accept="audio/*">
            <label class="upload-line" for="audio-file"><i class="fas fa-upload"></i> <span>Téléverser un fichier audio</span><small>MP3, WAV · 20 Mo max.</small></label>
          `}
          <div class="broadcast-actions">
            <button class="record-btn" id="record" ${draftText.trim() ? 'disabled' : ''}><i class="fas fa-microphone"></i>　 Enregistrer ma voix</button>
            <button class="instant-btn" id="instant-publish" ${!draftText.trim() && !customAudioUrl ? 'disabled' : ''}><i class="fas fa-bolt"></i>　 Publier instantanément</button>
          </div>
          <div class="schedule-block">
            <span class="eyebrow">HORAIRES DE DIFFUSION</span>
            <div class="time-chip-row">
              ${draftTimes.map((time, index) => `
                <span class="time-chip"><input type="time" data-time-index="${index}" value="${time}"><button type="button" class="remove-time" data-remove-time="${index}" aria-label="Retirer cette heure">×</button></span>`).join('')}
              <button type="button" id="add-time" class="add-time-btn"><i class="fas fa-plus"></i> Heure</button>
            </div>
            <label class="days-field"><span class="eyebrow">NOMBRE DE JOURS</span><input type="number" id="draft-days" min="1" max="60" value="${draftDays}"></label>
          </div>
          <button class="publish-btn" id="publish" ${!draftText.trim() && !customAudioUrl ? 'disabled' : ''}><i class="fas fa-calendar-check"></i> Programmer l'annonce　→</button>
          ${scheduledAnnouncements.length ? `
            <div class="scheduled-list">
              <span class="eyebrow">ANNONCES PROGRAMMÉES</span>
              ${scheduledAnnouncements.map((item) => {
                const elapsed = Math.floor((new Date(dateKey(now)).getTime() - new Date(item.createdAt).getTime()) / 86400000)
                const remaining = Math.max(0, item.days - elapsed)
                const icon = item.mode === 'voice' ? '🎙' : item.mode === 'text-voice' ? '🔊' : '🗒'
                const preview = item.text || (item.mode === 'voice' ? 'Message vocal' : '')
                return `<div class="scheduled-item">
                  <span class="scheduled-icon">${icon}</span>
                  <div><strong>${preview.length > 56 ? preview.slice(0, 56) + '…' : preview}</strong><small>${item.times.join(' · ')} · ${remaining} j restant${remaining > 1 ? 's' : ''}</small></div>
                  <button type="button" class="scheduled-delete" data-delete-id="${item.id}" aria-label="Supprimer cette annonce">✕</button>
                </div>`
              }).join('')}
            </div>
          ` : ''}
        </section>
        <section class="settings-panel prayer-settings">
          <div class="panel-title">
            <div><span class="eyebrow">MODE IQAMAH</span><h2>Écran de recueillement</h2></div>
            <button class="preview-btn" id="preview">Prévisualiser　↗</button>
          </div>
          <p class="panel-help">Fond noir automatique après l'Iqamah. La durée d'une prière n'étant pas exacte, réglez-la pour chaque type de prière.</p>
          <div class="duration-list">
            ${prayers.map((prayer) => `
              <label class="duration-row" data-prayer="${prayer.name}">
                <span><b>${prayer.name}</b><small>${prayer.arabic}</small></span>
                <input class="duration-input" type="range" min="5" max="60" value="${prayerDurations[prayer.name] ?? maxPrayerMinutes}">
                <output>${prayerDurations[prayer.name] ?? maxPrayerMinutes} min</output>
              </label>`).join('')}
          </div>
        </section>
        <section class="settings-panel notification-settings">
          <div class="panel-title">
            <div><span class="eyebrow">NOTIFICATIONS PUSH</span><h2>Rappel de prière</h2></div>
            <button class="save-btn" id="save-notification-delay">Enregistrer</button>
          </div>
          <p class="panel-help">Envoyer une notification push sur mobile avant chaque heure de prière.</p>
          <div class="notification-delay-row">
            <label>
              <span><b>Délai de notification</b><small>Minutes avant l'Adhan</small></span>
              <div class="delay-input-group">
                <input class="delay-input" type="range" id="notification-delay" min="5" max="60" step="5" value="${notificationDelay}">
                <output id="delay-output">${notificationDelay} min</output>
              </div>
            </label>
          </div>
        </section>
        <section class="settings-panel ticker-settings">
          <div class="panel-title">
            <div><span class="eyebrow">BANDEAU D'INFORMATIONS</span><h2>Actualités en continu</h2></div>
            <button class="save-btn" id="save-ticker">Mettre à jour</button>
          </div>
          <input class="ticker-input" id="ticker" value="${ticker}">
        </section>
        <section class="settings-panel calendar-settings"></section>
      </div>
    </section>

    <footer>
      <span>© ${now.getFullYear()} MASJID AL NOUR</span>
      <span class="developer-credit">Application développée par GDA Mali</span>
      <span>PAIX · FOI · COMMUNAUTÉ</span>
    </footer>

    <!-- Ticker -->
    <div class="ticker">
      <span class="ticker-tag">ACTUALITÉS</span>
      <div class="ticker-content">
        <div class="ticker-track">
          <span>${ticker}</span>
          <span>${ticker}</span>
        </div>
      </div>
    </div>

    <!-- Overlay prière -->
    <div class="prayer-overlay">
      <div class="overlay-symbol">م</div>
      <span class="eyebrow">MOMENT DE PRIÈRE · IQAMAH</span>
      <h2>Lignes serrées,<br><em>téléphones éteints...</em></h2>
      <p>La salle retrouvera sa lumière dans quelques instants.</p>
      <button id="end-prayer">Terminer le mode prière</button>
    </div>
  </div>`

  bindEvents()
}

const bindEvents = () => {
  refreshDateUI()
  refreshNextPrayerUI()

  // Mise à jour bulle speech avec prière suivante
  // Admin: calendar settings
  const systemCalendar = document.querySelector<HTMLElement>('.calendar-settings')
  if (systemCalendar) {
    const events = [...calendarEvents.entries()]
      .filter(([date]) => date.startsWith(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`))
      .sort(([a], [b]) => a.localeCompare(b))
    systemCalendar.innerHTML = `<div class="panel-title"><div><span class="eyebrow">CALENDRIER DU SYSTÈME</span><h2>Événements du mois</h2></div><span class="small-muted">Synchronisé automatiquement</span></div><p class="panel-help">Jours fériés nationaux et événements musulmans détectés automatiquement.</p><div class="system-events">${events.length ? events.map(([date, items]) => `<div class="system-event"><time>${new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</time><span>${items.map((item) => `${item.kind === 'holiday' ? 'Jour chômé' : 'Événement musulman'} : ${item.label}`).join('<br>')}</span></div>`).join('') : '<p class="panel-help">Synchronisation en cours...</p>'}</div>`
  }

  // Admin: email panel
  const adminHeading = document.querySelector<HTMLElement>('.admin-heading')
  if (adminHeading && !document.querySelector('.admin-email-panel')) {
    adminHeading.insertAdjacentHTML('afterend', `<section class="settings-panel admin-email-panel"><div class="panel-title"><div><span class="eyebrow">CONTACT</span><h2>E-mail de la mosquée</h2></div><span class="small-muted">Mobile</span></div><div class="admin-email-row"><input id="mosque-email" type="email" value="${mosqueEmail}" placeholder="contact@mosquee.ml"><button id="save-email" class="save-btn">Enregistrer</button></div><p class="panel-help">Cette adresse sera ouverte lorsque les fidèles écriront depuis l'application mobile.</p></section>`)
    document.querySelector<HTMLInputElement>('#mosque-email')?.addEventListener('input', (event) => { mosqueEmail = (event.target as HTMLInputElement).value })
    document.querySelector<HTMLButtonElement>('#save-email')?.addEventListener('click', async () => {
      const email = document.querySelector<HTMLInputElement>('#mosque-email')?.value.trim()
      if (!email || !email.includes('@')) return
      await patchMosqueSettings({ contactEmail: email })
      mosqueEmail = email
      await syncFromServer()
    })
  }

  // Event bindings
  document.querySelectorAll<HTMLElement>('.setting-row').forEach((row, index) => {
    const prayer = prayers[index]
    const inputs = row.querySelectorAll<HTMLInputElement>('input[type="time"]')
    inputs[0]?.addEventListener('change', () => { if (prayer && inputs[0].value) prayer.adhan = inputs[0].value; refreshNextPrayerUI() })
    inputs[1]?.addEventListener('change', () => { if (prayer && inputs[1].value) prayer.iqamah = inputs[1].value })
  })
  document.querySelector<HTMLButtonElement>('#save-schedule')?.addEventListener('click', async () => {
    const prayerTimes = Array.from(document.querySelectorAll<HTMLElement>('.schedule-panel .admin-table .setting-row'))
      .slice(0, prayers.length)
      .map((row, index) => {
        const inputs = row.querySelectorAll<HTMLInputElement>('input[type="time"]')
        return { name: prayers[index].name, adhan: inputs[0]?.value || prayers[index].adhan, iqamah: inputs[1]?.value || prayers[index].iqamah }
      })
    prayers.forEach((prayer, index) => {
      prayer.adhan = prayerTimes[index].adhan
      prayer.iqamah = prayerTimes[index].iqamah
    })
    const chourouqInput = document.querySelector<HTMLInputElement>('#chourouq-time')
    if (chourouqInput) {
      const val = chourouqInput.value.trim()
      customChourouqTime = val || null
      if (val) {
        try { localStorage.setItem('mosque-chourouq-time', val) } catch {}
      } else {
        try { localStorage.removeItem('mosque-chourouq-time') } catch {}
      }
    }
    const jumuahInput = document.querySelector<HTMLInputElement>('#jumuah-time')
    if (jumuahInput?.value) {
      jumuahTime = jumuahInput.value
    }
    await patchMosqueSettings({ prayerTimes, ...(jumuahTime ? { jumuahTime } : {}) }).catch(() => {})
    await syncFromServer()
    render()
  })
  document.querySelector<HTMLButtonElement>('#speak')?.addEventListener('click', () => speak(announcement))

  // Diffusion — saisie du texte (met à jour l'état sans re-render complet, pour ne pas perdre le curseur)
  document.querySelector<HTMLTextAreaElement>('#announcement')?.addEventListener('input', (event) => {
    draftText = (event.target as HTMLTextAreaElement).value
    const recordBtn = document.querySelector<HTMLButtonElement>('#record')
    if (recordBtn) recordBtn.disabled = !!draftText.trim()
    const publishBtn = document.querySelector<HTMLButtonElement>('#publish')
    if (publishBtn) publishBtn.disabled = !draftText.trim() && !customAudioUrl
  })

  // Diffusion — choix afficher en texte / lire à voix haute
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => { draftMode = btn.dataset.mode as AnnouncementMode; render() })
  })

  // Diffusion — fichier audio téléversé (exclusif avec le texte)
  document.querySelector<HTMLInputElement>('#audio-file')?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) { audioName = file.name; customAudioUrl = URL.createObjectURL(file); customAudioBlob = file; draftText = '' }
    render()
  })

  // Diffusion — retirer le message vocal en cours (redonne la main au texte)
  document.querySelector<HTMLButtonElement>('#clear-voice')?.addEventListener('click', () => {
    customAudioUrl = null; customAudioBlob = null; audioName = ''; draftMode = 'text-display'; render()
  })

  // Diffusion — enregistrement vocal direct (exclusif avec le texte)
  document.querySelector<HTMLButtonElement>('#record')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement
    if (button.disabled) return
    if (recorder?.state === 'recording') { recorder.stop(); button.textContent = '◉  Enregistrer ma voix'; return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordedChunks = []; recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (chunk) => recordedChunks.push(chunk.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(recordedChunks, { type: 'audio/webm' })
        customAudioUrl = URL.createObjectURL(blob); customAudioBlob = blob; audioName = 'message-enregistre.webm'; draftText = ''
        render()
      }
      recorder.start(); button.textContent = '●  Arrêter l\'enregistrement'; button.classList.add('recording')
    } catch { button.textContent = 'Microphone indisponible' }
  })

  // Diffusion — horaires programmés (ajout / retrait / édition)
  document.querySelectorAll<HTMLInputElement>('[data-time-index]').forEach((input) => {
    input.addEventListener('change', () => { draftTimes[Number(input.dataset.timeIndex)] = input.value })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-remove-time]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draftTimes.splice(Number(btn.dataset.removeTime), 1)
      if (!draftTimes.length) draftTimes = ['13:00']
      render()
    })
  })
  document.querySelector<HTMLButtonElement>('#add-time')?.addEventListener('click', () => { draftTimes.push('13:00'); render() })
  document.querySelector<HTMLInputElement>('#draft-days')?.addEventListener('input', (event) => {
    draftDays = Math.max(1, Math.min(60, Number((event.target as HTMLInputElement).value) || 1))
  })

  // Diffusion — programmer l'annonce : upload de l'audio si besoin, puis enregistrement côté serveur
  // (ainsi les autres appareils — écran public, mobile — la reçoivent via syncFromServer)
  document.querySelector<HTMLButtonElement>('#publish')?.addEventListener('click', () => { void publishScheduledAnnouncement() })
  
  // Diffusion — publication instantanée
  document.querySelector<HTMLButtonElement>('#instant-publish')?.addEventListener('click', () => { void publishInstantAnnouncement() })

  async function publishScheduledAnnouncement() {
    const text = draftText.trim()
    if (!text && !customAudioUrl) return
    const mode: AnnouncementMode = customAudioUrl ? 'voice' : draftMode
    const times = [...new Set(draftTimes.filter(Boolean))].sort()
    const days = draftDays

    let remoteAudioUrl: string | undefined
    if (customAudioBlob) {
      try {
        const form = new FormData()
        form.append('audio', customAudioBlob, audioName || 'message.webm')
        const uploadResponse = await fetch(`${apiBaseUrl}/admin/mosques/${mosqueId}/announcements/audio`, { method: 'POST', body: form })
        if (uploadResponse.ok) {
          const uploaded = await uploadResponse.json() as { url: string; name: string }
          remoteAudioUrl = uploaded.url
          audioName = uploaded.name || audioName
        }
      } catch { /* serveur indisponible — l'audio restera local à cet appareil */ }
    }

    // Ajout local immédiat (fonctionne même si le serveur est injoignable)
    scheduledAnnouncements.push({
      id: `ann-${Date.now()}`, mode, text, audioUrl: customAudioUrl, audioName,
      times, days, createdAt: dateKey(now),
    })
    draftText = ''; customAudioUrl = null; customAudioBlob = null; audioName = ''; draftMode = 'text-display'; draftTimes = ['13:00']; draftDays = 1
    render()

    try {
      await fetch(`${apiBaseUrl}/admin/mosques/${mosqueId}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode, audioUrl: remoteAudioUrl, audioName, times, days }),
      })
      await syncFromServer() // remplace l'entrée locale temporaire par la version serveur (identifiant définitif)
    } catch { /* serveur indisponible — l'annonce reste programmée localement sur cet appareil uniquement */ }
  }

  async function publishInstantAnnouncement() {
    const text = draftText.trim()
    if (!text && !customAudioUrl) return
    const mode: AnnouncementMode = customAudioUrl ? 'voice' : draftMode

    let remoteAudioUrl: string | undefined
    if (customAudioBlob) {
      try {
        const form = new FormData()
        form.append('audio', customAudioBlob, audioName || 'message.webm')
        const uploadResponse = await fetch(`${apiBaseUrl}/admin/mosques/${mosqueId}/announcements/audio`, { method: 'POST', body: form })
        if (uploadResponse.ok) {
          const uploaded = await uploadResponse.json() as { url: string; name: string }
          remoteAudioUrl = uploaded.url
        }
      } catch { /* serveur indisponible */ }
    }

    // Diffusion immédiate
    broadcastAnnouncement(mode, text, customAudioUrl || remoteAudioUrl || null)
    
    // Nettoyage du formulaire
    draftText = ''; customAudioUrl = null; customAudioBlob = null; audioName = ''; draftMode = 'text-display'
    render()
  }

  // Diffusion — supprimer une annonce programmée (annulation immédiate)
  document.querySelectorAll<HTMLButtonElement>('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteId || ''
      
      // Vérifier si l'annonce est actuellement affichée avant suppression
      const isCurrentlyDisplayed = hostMode === 'message' && scheduledAnnouncements.find(item => item.id === id)?.text === announcement
      
      // Suppression immédiate de l'affichage local
      scheduledAnnouncements = scheduledAnnouncements.filter((item) => item.id !== id)
      
      // Si une annonce est actuellement affichée (en mode message), l'effacer immédiatement
      if (isCurrentlyDisplayed) {
        hostMode = 'idle'
        darkScreen = false
        announcement = 'Bienvenue à la prière. Merci de garder le silence dans la salle.'
      }
      
      render()
      
      // Synchronisation avec le serveur (annonces déjà publiées)
      if (!id.startsWith('ann-')) {
        try {
          await fetch(`${apiBaseUrl}/admin/mosques/${mosqueId}/announcements/${id}`, { method: 'DELETE' })
          // Synchronisation immédiate pour mettre à jour tous les appareils
          await syncFromServer()
        } catch (error) {
          console.error('Erreur lors de la suppression de l\'annonce:', error)
          // En cas d'erreur, on garde la suppression locale mais on pourrait afficher un message d'erreur
        }
      }
    })
  })

  // Identité de la mosquée
  document.querySelector<HTMLInputElement>('#mosque-name')?.addEventListener('input', (event) => { mosqueName = (event.target as HTMLInputElement).value })
  document.querySelector<HTMLInputElement>('#mosque-city')?.addEventListener('input', (event) => { mosqueCity = (event.target as HTMLInputElement).value })
  document.querySelector<HTMLInputElement>('#mosque-phone')?.addEventListener('input', (event) => { mosquePhone = (event.target as HTMLInputElement).value })
  
  // Logo upload
  document.querySelector<HTMLInputElement>('#mosque-logo')?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) {
      mosqueLogoBlob = file
      mosqueLogoUrl = URL.createObjectURL(file)
      render()
    }
  })
  
  // Logo removal
  document.querySelector<HTMLButtonElement>('#remove-logo')?.addEventListener('click', () => {
    mosqueLogoUrl = null
    mosqueLogoBlob = null
    render()
  })
  
  document.querySelector<HTMLButtonElement>('#save-identity')?.addEventListener('click', async () => {
    const name = document.querySelector<HTMLInputElement>('#mosque-name')?.value.trim() || ''
    const city = document.querySelector<HTMLInputElement>('#mosque-city')?.value.trim() || ''
    const phone = document.querySelector<HTMLInputElement>('#mosque-phone')?.value.trim() || ''
    const savedImamName = document.querySelector<HTMLInputElement>('#imam-name')?.value.trim() || ''
    mosqueName = name
    mosqueCity = city
    mosquePhone = phone
    imamName = savedImamName
    try { localStorage.setItem('mosque-imam-name', savedImamName) } catch {}
    
    let remoteLogoUrl: string | undefined
    if (mosqueLogoBlob) {
      try {
        const form = new FormData()
        form.append('logo', mosqueLogoBlob, 'logo.png')
        const uploadResponse = await fetch(`${apiBaseUrl}/admin/mosques/${mosqueId}/logo`, { method: 'POST', body: form })
        if (uploadResponse.ok) {
          const uploaded = await uploadResponse.json() as { url: string }
          remoteLogoUrl = uploaded.url
        }
      } catch { /* serveur indisponible */ }
    }
    
    // Essayer de sauvegarder sur le serveur avec guideName (schéma actif) et repli sur imamName
    try {
      await patchMosqueSettings({ name, city, phone, guideName: savedImamName, ...(remoteLogoUrl ? { logoUrl: remoteLogoUrl } : {}) } as any)
    } catch {
      try {
        await patchMosqueSettings({ name, city, phone, imamName: savedImamName, ...(remoteLogoUrl ? { logoUrl: remoteLogoUrl } : {}) })
      } catch (err) {
        console.warn('Sauvegarde serveur échouée, état conservé localement:', err)
      }
    }
    try {
      await syncFromServer() // Synchronisation immédiate après sauvegarde
    } catch {}
    render()
  })
  let durationSaveTimer: number | undefined
  document.querySelectorAll<HTMLElement>('.duration-row').forEach((row) => {
    const prayerName = row.dataset.prayer || ''
    const input = row.querySelector<HTMLInputElement>('.duration-input')
    const output = row.querySelector<HTMLOutputElement>('output')
    input?.addEventListener('input', () => {
      let value = Number(input.value || 0)
      if (value < 1) value = 1
      prayerDurations[prayerName] = value
      if (output) output.textContent = `${value} min`
      // Enregistrement différé côté serveur pour ne pas spammer de requêtes pendant le glissement du curseur
      window.clearTimeout(durationSaveTimer)
      durationSaveTimer = window.setTimeout(async () => {
        await patchMosqueSettings({ prayerDurations }).catch(() => {})
        await syncFromServer() // Synchronisation immédiate après sauvegarde
      }, 800)
    })
  })
  
  // Notification delay settings
  const notificationDelayInput = document.querySelector<HTMLInputElement>('#notification-delay')
  const delayOutput = document.querySelector<HTMLOutputElement>('#delay-output')
  const saveNotificationDelayBtn = document.querySelector<HTMLButtonElement>('#save-notification-delay')
  
  notificationDelayInput?.addEventListener('input', () => {
    const value = Number(notificationDelayInput.value || 15)
    notificationDelay = value
    if (delayOutput) delayOutput.textContent = `${value} min`
  })
  
  saveNotificationDelayBtn?.addEventListener('click', async () => {
    try {
      await patchMosqueSettings({ notificationDelay })
      await syncFromServer()
      new Notification('Paramètres sauvegardés', { body: `Délai de notification : ${notificationDelay} minutes avant l'Adhan` })
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du délai de notification:', error)
    }
  })
  document.querySelector<HTMLButtonElement>('#preview')?.addEventListener('click', () => {
    const previewMinutes = prayerDurations[getNextPrayer().name] ?? maxPrayerMinutes
    darkScreen = true; hostMode = 'prayer'; render()
    window.setTimeout(() => { darkScreen = false; hostMode = 'warning'; render(); window.setTimeout(() => { hostMode = 'idle'; render() }, 2000) }, Math.min(previewMinutes, 5) * 1000)
  })
  document.querySelector<HTMLButtonElement>('#end-prayer')?.addEventListener('click', () => { darkScreen = false; hostMode = 'idle'; render() })
  document.querySelector<HTMLInputElement>('#ticker')?.addEventListener('input', (event) => {
    ticker = (event.target as HTMLInputElement).value
    const labels = document.querySelectorAll('.ticker div span')
    labels.forEach((label) => label.textContent = ticker)
  })
  document.querySelector<HTMLButtonElement>('#save-ticker')?.addEventListener('click', async () => {
    await patchMosqueSettings({ ticker }).catch(() => {})
    await syncFromServer() // Synchronisation immédiate après sauvegarde
    render()
  })
  document.querySelector<HTMLInputElement>('#jumuah-time')?.addEventListener('input', (event) => {
    jumuahTime = (event.target as HTMLInputElement).value
    render()
  })
  document.querySelector<HTMLInputElement>('#jumuah-time')?.addEventListener('change', async () => {
    await patchMosqueSettings({ jumuahTime }).catch(() => {})
    await syncFromServer() // Synchronisation immédiate après sauvegarde
    render()
  })
  document.querySelector<HTMLInputElement>('#chourouq-time')?.addEventListener('input', (event) => {
    const val = (event.target as HTMLInputElement).value
    customChourouqTime = val || null
    if (val) {
      try { localStorage.setItem('mosque-chourouq-time', val) } catch {}
    } else {
      try { localStorage.removeItem('mosque-chourouq-time') } catch {}
    }
    const chourouqEl = document.querySelector<HTMLElement>('.chourouq-hour')
    if (chourouqEl) chourouqEl.textContent = getChourouqTime()
  })
  document.querySelector<HTMLInputElement>('#chourouq-time')?.addEventListener('change', (event) => {
    const val = (event.target as HTMLInputElement).value
    customChourouqTime = val || null
    if (val) {
      try { localStorage.setItem('mosque-chourouq-time', val) } catch {}
    } else {
      try { localStorage.removeItem('mosque-chourouq-time') } catch {}
    }
    render()
  })
}

// ── Démarrage ────────────────────────────────────────────────
render()
void syncFromServer()
void loadCalendarEvents()
void fetchSunriseTime()

// Interroge le serveur toutes les 5 secondes pour refléter les changements faits sur un autre appareil
setInterval(() => { void syncFromServer() }, 5000)

// ── Boucle temps réel (toutes les secondes) ──────────────────
setInterval(() => {
  now = new Date()   // Toujours l'heure système actuelle

  if (isMobileLayout()) {
    checkPrayerEvents()
    checkScheduledAnnouncements()
    
    // Mise à jour légère mobile (sans re-render complet)
    const mobileCountdown = document.querySelector('.countdown-time')
    if (mobileCountdown) {
      const nextPrayer = getNextPrayer()
      mobileCountdown.textContent = formatCountdown(nextPrayer)
    }
    const mobileClock = document.getElementById('mobile-clock')
    if (mobileClock) {
      mobileClock.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }
    
    return
  }

  checkPrayerEvents()
  checkScheduledAnnouncements()
  refreshDateUI()
  refreshNextPrayerUI()

  // Mise à jour de l'horloge sans re-render complet
  const clock = document.querySelector('#clock')
  if (clock) clock.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  
  // Mise à jour du compte à rebours sur l'écran public
  const countdownElement = document.getElementById('public-countdown')
  if (countdownElement) {
    const nextPrayer = getNextPrayer()
    countdownElement.textContent = formatPrayerCountdownLabel(nextPrayer)
  }
}, 1000)

window.addEventListener('storage', (event) => {
  if (event.key === 'mosque-imam-name') {
    imamName = event.newValue || ''
    render()
  }
  if (event.key === 'mosque-chourouq-time') {
    customChourouqTime = event.newValue || null
    render()
  }
})

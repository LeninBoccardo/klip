import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { detectInitialLanguage } from './detect'

import enCommon from './locales/en/common.json'
import enNavigation from './locales/en/navigation.json'
import enSettings from './locales/en/settings.json'
import enSearch from './locales/en/search.json'
import enLibrary from './locales/en/library.json'
import enCreators from './locales/en/creators.json'
import enVideos from './locales/en/videos.json'
import enDownloads from './locales/en/downloads.json'
import enCollections from './locales/en/collections.json'
import enPlayer from './locales/en/player.json'
import enAbout from './locales/en/about.json'
import enTags from './locales/en/tags.json'
import enCuts from './locales/en/cuts.json'
import enActivity from './locales/en/activity.json'
import enShortcuts from './locales/en/shortcuts.json'
import enDashboard from './locales/en/dashboard.json'
import enOnboarding from './locales/en/onboarding.json'
import enEditor from './locales/en/editor.json'

import ptBRCommon from './locales/pt-BR/common.json'
import ptBRNavigation from './locales/pt-BR/navigation.json'
import ptBRSettings from './locales/pt-BR/settings.json'
import ptBRSearch from './locales/pt-BR/search.json'
import ptBRLibrary from './locales/pt-BR/library.json'
import ptBRCreators from './locales/pt-BR/creators.json'
import ptBRVideos from './locales/pt-BR/videos.json'
import ptBRDownloads from './locales/pt-BR/downloads.json'
import ptBRCollections from './locales/pt-BR/collections.json'
import ptBRPlayer from './locales/pt-BR/player.json'
import ptBRAbout from './locales/pt-BR/about.json'
import ptBRTags from './locales/pt-BR/tags.json'
import ptBRCuts from './locales/pt-BR/cuts.json'
import ptBRActivity from './locales/pt-BR/activity.json'
import ptBRShortcuts from './locales/pt-BR/shortcuts.json'
import ptBRDashboard from './locales/pt-BR/dashboard.json'
import ptBROnboarding from './locales/pt-BR/onboarding.json'
import ptBREditor from './locales/pt-BR/editor.json'

import esCommon from './locales/es/common.json'
import esNavigation from './locales/es/navigation.json'
import esSettings from './locales/es/settings.json'
import esSearch from './locales/es/search.json'
import esLibrary from './locales/es/library.json'
import esCreators from './locales/es/creators.json'
import esVideos from './locales/es/videos.json'
import esDownloads from './locales/es/downloads.json'
import esCollections from './locales/es/collections.json'
import esPlayer from './locales/es/player.json'
import esAbout from './locales/es/about.json'
import esTags from './locales/es/tags.json'
import esCuts from './locales/es/cuts.json'
import esActivity from './locales/es/activity.json'
import esShortcuts from './locales/es/shortcuts.json'
import esDashboard from './locales/es/dashboard.json'
import esOnboarding from './locales/es/onboarding.json'
import esEditor from './locales/es/editor.json'

/**
 * i18next bootstrap — synchronous and offline. All resources are statically
 * imported so the first React render already has the right language with no
 * Suspense boundary or network round-trip. The DB-persisted preference is
 * reconciled later by `<PreferencesBootstrap />`.
 */
export const resources = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    settings: enSettings,
    search: enSearch,
    library: enLibrary,
    creators: enCreators,
    videos: enVideos,
    downloads: enDownloads,
    collections: enCollections,
    player: enPlayer,
    about: enAbout,
    tags: enTags,
    cuts: enCuts,
    activity: enActivity,
    shortcuts: enShortcuts,
    dashboard: enDashboard,
    onboarding: enOnboarding,
    editor: enEditor
  },
  'pt-BR': {
    common: ptBRCommon,
    navigation: ptBRNavigation,
    settings: ptBRSettings,
    search: ptBRSearch,
    library: ptBRLibrary,
    creators: ptBRCreators,
    videos: ptBRVideos,
    downloads: ptBRDownloads,
    collections: ptBRCollections,
    player: ptBRPlayer,
    about: ptBRAbout,
    tags: ptBRTags,
    cuts: ptBRCuts,
    activity: ptBRActivity,
    shortcuts: ptBRShortcuts,
    dashboard: ptBRDashboard,
    onboarding: ptBROnboarding,
    editor: ptBREditor
  },
  es: {
    common: esCommon,
    navigation: esNavigation,
    settings: esSettings,
    search: esSearch,
    library: esLibrary,
    creators: esCreators,
    videos: esVideos,
    downloads: esDownloads,
    collections: esCollections,
    player: esPlayer,
    about: esAbout,
    tags: esTags,
    cuts: esCuts,
    activity: esActivity,
    shortcuts: esShortcuts,
    dashboard: esDashboard,
    onboarding: esOnboarding,
    editor: esEditor
  }
} as const

void i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: [
    'common',
    'navigation',
    'settings',
    'search',
    'library',
    'creators',
    'videos',
    'downloads',
    'collections',
    'player',
    'about',
    'tags',
    'cuts',
    'activity',
    'shortcuts',
    'dashboard',
    'onboarding',
    'editor'
  ],
  interpolation: {
    // React already escapes by default — double-escaping breaks accents.
    escapeValue: false
  },
  returnNull: false
})

export default i18n

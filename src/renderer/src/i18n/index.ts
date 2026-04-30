import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { detectInitialLanguage } from './detect'

import enCommon from './locales/en/common.json'
import enNavigation from './locales/en/navigation.json'
import enSettings from './locales/en/settings.json'
import enSearch from './locales/en/search.json'

import ptBRCommon from './locales/pt-BR/common.json'
import ptBRNavigation from './locales/pt-BR/navigation.json'
import ptBRSettings from './locales/pt-BR/settings.json'
import ptBRSearch from './locales/pt-BR/search.json'

import esCommon from './locales/es/common.json'
import esNavigation from './locales/es/navigation.json'
import esSettings from './locales/es/settings.json'
import esSearch from './locales/es/search.json'

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
    search: enSearch
  },
  'pt-BR': {
    common: ptBRCommon,
    navigation: ptBRNavigation,
    settings: ptBRSettings,
    search: ptBRSearch
  },
  es: {
    common: esCommon,
    navigation: esNavigation,
    settings: esSettings,
    search: esSearch
  }
} as const

void i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'navigation', 'settings', 'search'],
  interpolation: {
    // React already escapes by default — double-escaping breaks accents.
    escapeValue: false
  },
  returnNull: false
})

export default i18n

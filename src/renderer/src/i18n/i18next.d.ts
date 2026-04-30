import 'react-i18next'
import type { resources } from './index'

/**
 * Declaration-merging hook so `t('settings.page.title')` and friends are
 * type-checked against the EN bundle. Unknown keys fail typecheck; renaming a
 * key in the JSON triggers a typecheck error at every call site.
 *
 * The EN bundle is the source of truth — translations are checked at runtime
 * against it but their TS shape is intentionally NOT widened (otherwise
 * pt-BR/es could diverge silently).
 */
declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: (typeof resources)['en']
  }
}

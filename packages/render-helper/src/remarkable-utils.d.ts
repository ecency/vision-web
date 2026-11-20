// remarkable exports `utils` by name (dist/cjs and dist/esm), while
// @types/remarkable declares it only as a static on the class, which the
// runtime does not set.
import type * as RemarkableUtils from 'remarkable/lib/common/utils'

declare module 'remarkable' {
  export const utils: typeof RemarkableUtils
}

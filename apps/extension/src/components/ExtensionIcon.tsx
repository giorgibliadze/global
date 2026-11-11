import { getExtensionAssetUrl } from '../services/browser'

export function ExtensionIcon() {
  return <img src={getExtensionAssetUrl('icons/auto-importer-128.png')} width="40" height="40" alt="" aria-hidden="true" />
}

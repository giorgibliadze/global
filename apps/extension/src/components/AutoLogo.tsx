import { getExtensionAssetUrl } from '../services/browser'

export function AutoLogo() {
  return (
    <div className="brand-logo">
      <img
        src={getExtensionAssetUrl('images/global-auto-transporter-logo.png')}
        alt="GLOBAL AUTO TRANSPORTER"
        width="180"
        height="180"
      />
    </div>
  )
}

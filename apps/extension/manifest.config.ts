
import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Auto Importer",
  version: "1.0.0",
  description: "ავტომობილის განცხადებების გადატანა აუქციონებიდან MyAuto.ge-ზე",

  permissions: ["activeTab", "storage", "tabs"],

  host_permissions: [
    "https://*.manheim.com/*",
    "https://*.edgepipeline.com/*",
    "https://*.adesa.com/*",
    "https://*.myauto.ge/*"
  ],

  icons: {
    16: "icons/auto-importer-16.png",
    32: "icons/auto-importer-32.png",
    48: "icons/auto-importer-48.png",
    128: "icons/auto-importer-128.png"
  },

  content_scripts: [{
    matches: [
      "*://*.manheim.com/*",
      "*://*.adesa.com/*",
      "*://*.edgepipeline.com/*"
    ],
    js: ["src/content/index.tsx"],
    run_at: "document_idle",
    all_frames: false
  }],

  web_accessible_resources: [{
    resources: ["icons/auto-importer-128.png", "images/global-auto-transporter-logo.png"],
    matches: [
      "*://*.manheim.com/*",
      "*://*.adesa.com/*",
      "*://*.edgepipeline.com/*"
    ]
  }],

  action: {
    default_title: "Auto Importer — GLOBAL AUTO TRANSPORTER",
    default_popup: "index.html",
    default_icon: {
      16: "icons/auto-importer-16.png",
      32: "icons/auto-importer-32.png",
      48: "icons/auto-importer-48.png",
      128: "icons/auto-importer-128.png"
    }
  }
});

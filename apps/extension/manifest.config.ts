
import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Auto Importer",
  version: "1.0.0",
  description: "Import vehicle listings from auctions to MyAuto.ge",

  permissions: ["activeTab", "storage", "tabs"],

  host_permissions: [
    "https://*.manheim.com/*",
    "https://*.edgepipeline.com/*",
    "https://*.adesa.com/*",
    "https://*.myauto.ge/*"
  ],

  action: {
    default_popup: "index.html"
  }
});

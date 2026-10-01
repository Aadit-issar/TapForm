const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const AID = 'F04E464354415001';

module.exports = function withTapFormNfc(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0];
    app.$['android:usesCleartextTraffic'] = 'false';
    const featureList = mod.modResults.manifest['uses-feature'] || (mod.modResults.manifest['uses-feature'] = []);
    for (const name of ['android.hardware.nfc', 'android.hardware.nfc.hce']) {
      if (!featureList.some((feature) => feature.$['android:name'] === name)) featureList.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    const permissions = mod.modResults.manifest['uses-permission'] || (mod.modResults.manifest['uses-permission'] = []);
    if (!permissions.some((permission) => permission.$['android:name'] === 'android.permission.POST_NOTIFICATIONS')) {
      permissions.push({ $: { 'android:name': 'android.permission.POST_NOTIFICATIONS' } });
    }
    const services = app.service || (app.service = []);
    if (!services.some((service) => service.$['android:name'] === 'expo.modules.nfcpeer.TapFormApduService')) {
      services.push({
        $: { 'android:name': 'expo.modules.nfcpeer.TapFormApduService', 'android:exported': 'true', 'android:permission': 'android.permission.BIND_NFC_SERVICE' },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.nfc.cardemulation.action.HOST_APDU_SERVICE' } }] }],
        'meta-data': [{ $: { 'android:name': 'android.nfc.cardemulation.host_apdu_service', 'android:resource': '@xml/tapform_apdu_service' } }],
      });
    }
    return mod;
  });

  return withDangerousMod(config, ['android', async (mod) => {
    const resDir = path.join(mod.modRequest.projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(resDir, { recursive: true });
    fs.writeFileSync(path.join(resDir, 'tapform_apdu_service.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<host-apdu-service xmlns:android="http://schemas.android.com/apk/res/android" android:description="@string/app_name" android:requireDeviceUnlock="false">\n  <aid-group android:description="@string/app_name" android:category="other">\n    <aid-filter android:name="${AID}" />\n  </aid-group>\n</host-apdu-service>\n`);
    const drawableDir = path.join(mod.modRequest.projectRoot, 'android', 'app', 'src', 'main', 'res', 'drawable');
    fs.mkdirSync(drawableDir, { recursive: true });
    fs.writeFileSync(path.join(drawableDir, 'tapform_notification.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="48" android:viewportHeight="48">\n  <path android:fillColor="#FFFFFFFF" android:pathData="M24,3.5a3.5,3.5 0,1 0,0.01 0M10,14h28v4h-9v24h-4V18h-6v24h-4V18h-5zM31,24h7v3h-7zM31,32h7v3h-7z" />\n</vector>\n`);
    return mod;
  }]);
};

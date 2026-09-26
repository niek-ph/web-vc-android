const fs = require('node:fs');

// Android Studio launched from Finder does not inherit the terminal's Node PATH.
const file = 'android/local.properties';
let properties = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
for (const [key, value] of Object.entries({
  'sdk.dir': process.env.ANDROID_HOME,
  'node.binary': process.execPath,
})) {
  if (!value) {
    throw new Error(
      `Missing value for ${key}; run through scripts/android.sh.`,
    );
  }
  const escaped = value.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
  const line = `${key}=${escaped}`;
  const pattern = new RegExp(`^${key.replace('.', '\\.')}=.*$`, 'm');
  properties = pattern.test(properties)
    ? properties.replace(pattern, () => line)
    : `${properties.trimEnd()}\n${line}\n`;
}
fs.writeFileSync(file, properties.trimStart());

const { withInfoPlist, withProjectBuildGradle } = require('expo/config-plugins');

const repository = `
// GO Switch Espressif provisioning libraries
allprojects {
  repositories {
    maven {
      url = uri("https://jitpack.io")
      content {
        includeGroup("com.github.espressif")
        includeGroup("com.github.yuriy-budiyev")
      }
    }
  }
}
`;

const zeroconfCompileSdk = `
// Build expo-zeroconf against the app's compile SDK.
subprojects { subproject ->
  if (subproject.name == "expo-zeroconf") {
    subproject.pluginManager.withPlugin("com.android.library") {
      subproject.extensions.getByName("androidComponents").finalizeDsl { android ->
        android.compileSdk = rootProject.ext.compileSdkVersion
      }
    }
  }
}
`;

module.exports = (config) => {
  config = withInfoPlist(config, (config) => {
    config.modResults.NSBluetoothAlwaysUsageDescription =
      'GO Switch uses Bluetooth to securely set up your switch and change its Wi-Fi network.';
    return config;
  });
  return withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('// GO Switch Espressif provisioning libraries')) {
      config.modResults.contents += repository;
    }
    if (!config.modResults.contents.includes("// Build expo-zeroconf against the app's compile SDK.")) {
      config.modResults.contents += zeroconfCompileSdk;
    }
    return config;
  });
};

const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Injects a Gradle `splits { abi { ... } }` block into android/app/build.gradle
 * so release builds produce a single small APK for arm64-v8a — the
 * architecture virtually all real Android phones (2018+) use — instead of one
 * "fat" universal APK containing native .so libraries for all 4 ABIs.
 *
 * Scoped to just arm64-v8a (rather than splitting into 4 separate APKs) so
 * EAS still emits one directly-downloadable/installable .apk artifact, not a
 * .tar.gz of 4 APKs that needs extracting.
 *
 * Only affects `buildType: "apk"` builds (e.g. the EAS "preview" profile) —
 * app-bundle (AAB) builds already get this for free from Play Store's
 * per-device dynamic delivery, so this plugin doesn't change AAB output.
 */
function withAbiSplit(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('splits {')) {
      return config;
    }

    config.modResults.contents = config.modResults.contents.replace(
      /android\s*\{/,
      `android {
    splits {
        abi {
            reset()
            enable true
            universalApk false
            include "arm64-v8a"
        }
    }
`
    );

    return config;
  });
}

module.exports = withAbiSplit;

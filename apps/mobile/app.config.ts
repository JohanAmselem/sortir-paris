import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * Configuration de l'appli Paname Club (iOS + Android).
 *
 * Variables (EAS ou .env.local), toutes facultatives en développement :
 * - EXPO_PUBLIC_API_URL                 site qui sert l'API (défaut : https://www.panameclub.fr)
 * - EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY  connexion (mêmes valeurs publiques que le site)
 * - EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID / EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID  connexion Google
 * - EXPO_PUBLIC_POSTHOG_KEY             mesure d'usage (PostHog UE)
 * - GOOGLE_MAPS_ANDROID_KEY             carte Android (Google Maps SDK)
 * - EAS_PROJECT_ID                      projet Expo (notifications), donné par `eas init`
 */
const IOS_GOOGLE_CLIENT = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''
/** com.googleusercontent.apps.<id> : le schéma inverse de l'identifiant iOS, exigé par Google. */
const googleUrlScheme = IOS_GOOGLE_CLIENT ? `com.googleusercontent.apps.${IOS_GOOGLE_CLIENT.replace('.apps.googleusercontent.com', '')}` : null

const CREAM = '#f7f5ef'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Paname Club',
  slug: 'panameclub',
  owner: process.env.EAS_OWNER || undefined,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/brand/icon.png',
  scheme: 'panameclub',
  // L'appli suit la charte claire du site (crème, encre) ; pas de mode sombre en V1.
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'fr.panameclub.app',
    buildNumber: '1',
    supportsTablet: false,
    usesAppleSignIn: true,
    // www seulement : panameclub.fr redirige vers www, et Apple ne suit pas les redirections.
    associatedDomains: ['applinks:www.panameclub.fr', 'webcredentials:www.panameclub.fr'],
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      CFBundleDevelopmentRegion: 'fr',
      // Nom montré par iOS dans « … souhaite utiliser accounts.google.com » (sinon « PanameClub », le nom du projet Xcode).
      CFBundleName: 'Paname Club',
      CFBundleAllowMixedLocalizations: true,
      // La couleur de la barre d'état est pilotée par l'appli (lib/status-bar.ts), écran par écran.
      UIViewControllerBasedStatusBarAppearance: false,
      UIUserInterfaceStyle: 'Light',
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
      ],
    },
  },
  android: {
    package: 'fr.panameclub.app',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: CREAM,
      foregroundImage: './assets/brand/android-foreground.png',
      monochromeImage: './assets/brand/android-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION', 'android.permission.RECORD_AUDIO'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: ['/evenements', '/lieux', '/oeuvres', '/films', '/drop', '/club', '/match', '/quiz'].map((pathPrefix) => ({
          scheme: 'https',
          host: 'www.panameclub.fr',
          pathPrefix,
        })),
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    /** Projet Firebase « paname-club » : jeton FCM des notifications Android (fichier public). */
    googleServicesFile: './google-services.json',
    config: process.env.GOOGLE_MAPS_ANDROID_KEY ? { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY } } : undefined,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: CREAM,
        image: './assets/brand/splash-mark.png',
        imageWidth: 120,
      },
    ],
    [
      'expo-notifications',
      {
        color: '#7436e3',
        defaultChannel: 'alertes',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Paname Club utilise ta position seulement quand tu cherches des sorties près de toi. Elle n’est jamais enregistrée.',
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
      },
    ],
    [
      'expo-calendar',
      {
        calendarPermission: 'Paname Club ajoute à ton calendrier les sorties que tu choisis.',
        writeOnlyCalendarPermission: 'Paname Club ajoute à ton calendrier les sorties que tu choisis.',
        writeOnlyAccess: true,
        remindersPermission: false,
      },
    ],
    'expo-apple-authentication',
    'expo-secure-store',
    'expo-font',
    'expo-web-browser',
    ...(googleUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleUrlScheme }] as [string, unknown]] : []),
    ['expo-build-properties', { ios: { deploymentTarget: '16.4' } }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
    router: { origin: 'https://www.panameclub.fr' },
    /** Expo retire `android.config` de la config lue par l'appli : on dit ici, sans la clé, si la carte Android peut s'afficher. */
    androidMaps: Boolean(process.env.GOOGLE_MAPS_ANDROID_KEY),
  },
  updates: process.env.EAS_PROJECT_ID ? { url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}` } : undefined,
  runtimeVersion: { policy: 'appVersion' },
})

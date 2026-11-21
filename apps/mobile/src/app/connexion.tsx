/**
 * Rejoindre le Club : Apple (iPhone), Google, ou e-mail avec un code à 6 chiffres.
 * Tout ce qui a été fait sans compte sur le téléphone est repris (lib/auth.tsx).
 */
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth'
import { openWeb } from '@/lib/actions'
import { Button, Divider, Notice, T } from '@/components/ui'
import { colors, fonts, GUTTER, radius } from '@/theme'

const REASONS: Record<string, string> = {
  alertes: 'Connecte-toi pour suivre cet artiste : on te prévient de ses dates à Paris.',
  jyvais: 'Connecte-toi pour dire « J’y vais » et recevoir un rappel la veille.',
  suivre: 'Connecte-toi pour suivre ce lieu et voir ses nouvelles dates.',
}

export default function Connexion() {
  const { raison } = useLocalSearchParams<{ raison?: string }>()
  const insets = useSafeAreaInsets()
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const done = () => (router.canGoBack() ? router.back() : router.replace('/moi'))

  const run = async (key: string, fn: () => Promise<boolean | void>) => {
    setBusy(key)
    setError(null)
    try {
      const ok = await fn()
      if (ok !== false && key !== 'send') done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La connexion n’a pas abouti.')
    } finally {
      setBusy(null)
    }
  }

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ padding: GUTTER, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Image source={require('@/../assets/brand/wordmark.png')} style={styles.logo} contentFit="contain" accessibilityLabel="Paname Club" />
        <T v="h1" style={{ marginTop: 20 }}>
          Garde tes sorties, reçois les tiennes.
        </T>
        <T v="small" style={{ marginTop: 8 }}>
          {(raison && REASONS[raison]) || 'Tes sorties sur tous tes appareils, tes alertes concerts, ton Drop du lundi. Ce que tu as fait sans compte est repris.'}
        </T>

        {error ? <View style={{ marginTop: 16, marginHorizontal: -GUTTER }}><Notice text={error} tone="error" /></View> : null}

        <View style={{ marginTop: 24, gap: 10 }}>
          {auth.appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.full}
              style={{ height: 50 }}
              onPress={() => run('apple', auth.signInWithApple)}
            />
          ) : null}
          {auth.googleAvailable ? (
            <Button label="Continuer avec Google" kind="secondary" loading={busy === 'google'} onPress={() => run('google', auth.signInWithGoogle)} />
          ) : null}
        </View>

        {auth.appleAvailable || auth.googleAvailable ? (
          <View style={styles.or}>
            <Divider />
            <T v="caption" style={styles.orText}>
              ou par e-mail
            </T>
          </View>
        ) : null}

        {step === 'email' ? (
          <View style={{ gap: 10 }}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="ton@email.fr"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={() => validEmail && run('send', async () => (await auth.sendEmailCode(email), setStep('code')))}
              style={styles.input}
              accessibilityLabel="Adresse e-mail"
            />
            <Button
              label="Recevoir un code"
              disabled={!validEmail}
              loading={busy === 'send'}
              onPress={() => run('send', async () => (await auth.sendEmailCode(email), setStep('code')))}
            />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <T v="small">
              Code envoyé à <T v="label">{email.trim()}</T>. Il arrive en moins d’une minute (pense aux courriers indésirables).
            </T>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
              placeholder="123456"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              style={[styles.input, styles.code]}
              accessibilityLabel="Code reçu par e-mail"
              autoFocus
            />
            <Button label="Valider" disabled={code.length < 6} loading={busy === 'verify'} onPress={() => run('verify', () => auth.verifyEmailCode(email, code))} />
            <Button label="Changer d’adresse" kind="ghost" compact onPress={() => (setStep('email'), setCode(''))} />
          </View>
        )}

        <T v="caption" style={{ marginTop: 24 }}>
          En continuant, tu acceptes que Paname Club traite tes données pour ton compte et tes alertes, comme expliqué dans la{' '}
          <T v="caption" style={{ color: colors.accent }} onPress={() => openWeb('https://www.panameclub.fr/confidentialite')}>
            politique de confidentialité
          </T>
          .
        </T>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  logo: { width: 190, height: 22, marginTop: 4 },
  or: { marginVertical: 14 },
  orText: { position: 'absolute', alignSelf: 'center', top: 3, backgroundColor: colors.paper, paddingHorizontal: 10 },
  input: {
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 17,
    color: colors.ink,
  },
  code: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: 6, textAlign: 'center' },
})

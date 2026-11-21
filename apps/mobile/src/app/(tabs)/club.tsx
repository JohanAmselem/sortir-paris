/**
 * Onglet « Le Club » (décision Q4 du 21/11 : tout le Club dès la V1).
 * Niveau, XP et badges ; Drop de la semaine ; Match, quiz, ADN ; défi de la
 * semaine ; Top des membres, plus consultées, plus gardées, coups de cœur.
 * Mêmes données que /club sur le site (GET /api/v1/club).
 */
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Flame, Fingerprint, MapPin, Sparkles } from 'lucide-react-native'
import type { ClubResponse } from '@/shared'
import { useClub } from '@/lib/queries'
import { useSession } from '@/lib/auth'
import { errorMessage } from '@/lib/api'
import { plural, weekLabel } from '@/lib/club'
import { Button, Card, ErrorState, Loading, SectionHeader, T } from '@/components/ui'
import { EventCard } from '@/components/EventCard'
import { EntryRow, EventRail, ProgressBar } from '@/components/club/parts'
import { colors, fonts, GUTTER, radius } from '@/theme'
import { StatusBarBackdrop } from '@/components/StatusBarBackdrop'

export default function ClubScreen() {
  const insets = useSafeAreaInsets()
  const session = useSession()
  const club = useClub()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    await club.refetch().catch(() => {})
    setRefreshing(false)
  }

  if (club.isPending) return <Loading label="Le Club arrive…" />
  if (club.isError && !club.data) return <ErrorState message={errorMessage(club.error)} onRetry={() => club.refetch()} />
  const data = club.data!

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}>
      <View style={{ paddingHorizontal: GUTTER }}>
        <T v="kicker">Le Club</T>
        <T v="display" accessibilityRole="header" style={{ marginTop: 4 }}>
          Joue, garde, sors.
        </T>
      </View>

      <View style={{ paddingHorizontal: GUTTER, marginTop: 18 }}>
        {data.member ? <MemberCard member={data.member} /> : <JoinCard />}
      </View>

      <DropCard drop={data.drop} />

      <View style={styles.block}>
        <SectionHeader kicker="Jouer" title="Affine tes goûts" />
        <View style={{ paddingHorizontal: GUTTER, gap: 10 }}>
          <EntryRow
            icon={<Flame size={22} color={colors.accent} />}
            title="Match"
            text="Swipe les sorties de la semaine : on apprend ce qui te tente."
            onPress={() => router.push('/match')}
          />
          <EntryRow
            icon={<Sparkles size={22} color={colors.accent} />}
            title="Tu préfères…"
            text="10 questions, 2 minutes : ton profil culturel, et un Drop à ton image."
            onPress={() => router.push('/quiz')}
          />
          {session ? (
            <EntryRow
              icon={<Fingerprint size={22} color={colors.accent} />}
              title="Mon ADN culturel"
              text="Ton profil, tes catégories, ton niveau."
              onPress={() => router.push('/adn')}
            />
          ) : null}
        </View>
      </View>

      <ChallengeCard challenge={data.challenge} loggedIn={!!session} />

      {data.topThisWeek.length ? (
        <View style={styles.block}>
          <SectionHeader kicker="Cette semaine" title="Le Top des membres" />
          <View style={{ paddingHorizontal: GUTTER }}>
            {data.topThisWeek.slice(0, 8).map((r, i) => (
              <View key={r.event.id}>
                <EventCard event={r.event} variant="row" rank={i + 1} origin="club-top" />
                <Text style={styles.rowCaption}>{topCaption(r.saves, r.attendances)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {data.mostViewed.length ? (
        <View style={styles.block}>
          <SectionHeader kicker="Le Club regarde" title="Les plus consultées" />
          <EventRail events={data.mostViewed.map((r) => r.event)} origin="club-vues" />
        </View>
      ) : null}

      {data.mostSaved.length ? (
        <View style={styles.block}>
          <SectionHeader kicker="Le Club garde" title="Les plus gardées" />
          <EventRail
            events={data.mostSaved.map((r) => r.event)}
            origin="club-gardees"
            caption={(_e, i) => plural(data.mostSaved[i].count, 'membre l’a gardée', 'membres l’ont gardée')}
          />
        </View>
      ) : null}

      {data.lovedPast.length ? (
        <View style={styles.block}>
          <SectionHeader kicker="Notées par les membres" title="Les coups de cœur" />
          <View style={{ paddingHorizontal: GUTTER }}>
            {data.lovedPast.map((r) => (
              <View key={r.event.id}>
                <EventCard event={r.event} variant="row" origin="club-notes" />
                <Text style={styles.rowCaption}>
                  {r.avgRating.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / 5 · {plural(r.reviews, 'avis', 'avis')}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
    <StatusBarBackdrop color={colors.paper} />
    </View>
  )
}

function topCaption(saves: number, attendances: number): string {
  const parts: string[] = []
  if (attendances) parts.push(plural(attendances, 'membre y va', 'membres y vont'))
  if (saves) parts.push(plural(saves, 'l’a gardée', 'l’ont gardée'))
  return parts.join(' · ')
}

function JoinCard() {
  return (
    <View style={styles.night}>
      <T v="kicker" style={{ color: colors.accentGlow }}>
        Rejoins le Club
      </T>
      <Text style={styles.nightTitle}>Tes sorties, ton niveau, tes alertes.</Text>
      <Text style={styles.nightText}>
        Gagne de l’XP en gardant des sorties et en disant « j’y vais », débloque des badges, reçois ton Drop du lundi. Tes swipes et ton quiz faits
        sans compte sont repris.
      </Text>
      <Button label="Rejoindre le Club" kind="light" onPress={() => router.push('/connexion')} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
    </View>
  )
}

function MemberCard({ member }: { member: NonNullable<ClubResponse['member']> }) {
  const [showAll, setShowAll] = useState(false)
  const earned = member.badges.filter((b) => b.earned)
  const shown = showAll ? member.badges : member.badges.filter((b) => b.earned).concat(member.badges.filter((b) => !b.earned).slice(0, 2))
  const toNext = member.nextLevel ? Math.max(0, member.nextLevel.xp - member.xp) : 0
  return (
    <View style={styles.night}>
      <Text style={styles.nightKicker}>{member.name ? `Salut ${member.name.split(/\s+/)[0]}` : 'Ton niveau'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
        <Text style={styles.levelNumber} accessibilityLabel={`Niveau ${member.level}`}>
          {member.level}
        </Text>
        <Text style={styles.nightTitle}>{member.levelName}</Text>
      </View>
      <Text style={[styles.nightText, { marginTop: 6 }]}>
        {member.xp} XP{member.nextLevel ? ` · encore ${toNext} XP avant « ${member.nextLevel.name} »` : ' · niveau maximal atteint'}
      </Text>
      <View style={{ marginTop: 10 }}>
        <ProgressBar value={member.progress} dark label={`Progression vers le niveau suivant : ${member.progress} %`} />
      </View>

      <View style={styles.badgesHeader}>
        <Text style={styles.nightSubtitle}>
          Badges · {earned.length}/{member.badges.length}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} hitSlop={10}>
          <Text style={styles.nightLink}>{showAll ? 'Moins' : 'Tous les badges'}</Text>
        </Pressable>
      </View>
      <View style={styles.badges}>
        {shown.map((b) => (
          <View
            key={b.slug}
            accessible
            accessibilityLabel={`${b.name}${b.earned ? ', obtenu' : `, ${b.value} sur ${b.goal}`}. ${b.desc}`}
            style={[styles.badge, !b.earned && { opacity: 0.55 }]}>
            <Text style={styles.badgeEmoji}>{b.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.badgeName}>{b.name}</Text>
              <Text style={styles.badgeDesc}>{b.earned ? 'Obtenu' : `${b.desc} · ${b.value}/${b.goal}`}</Text>
            </View>
          </View>
        ))}
      </View>
      {member.upcomingSaved ? (
        <Text style={[styles.nightText, { marginTop: 12 }]}>{plural(member.upcomingSaved, 'sortie gardée à venir', 'sorties gardées à venir')}</Text>
      ) : null}
    </View>
  )
}

function DropCard({ drop }: { drop: ClubResponse['drop'] }) {
  if (!drop.events.length) return null
  const titles = drop.events.slice(0, 3).map((e) => e.title)
  return (
    <View style={styles.block}>
      <SectionHeader kicker={weekLabel(drop.weekStart) ?? 'Cette semaine'} title="Ton Drop de la semaine" onMore={() => router.push('/drop')} moreLabel="Les 5 idées" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ton Drop de la semaine : ${titles.join(', ')}. Ouvrir les ${drop.events.length} idées.`}
        onPress={() => router.push('/drop')}
        style={({ pressed }) => [{ paddingHorizontal: GUTTER, opacity: pressed ? 0.9 : 1 }]}>
        <Card>
          <Text style={styles.dropLead}>{drop.personalized ? 'Choisi selon tes goûts' : '5 idées pour ta semaine à Paris'}</Text>
          {titles.map((t, i) => (
            <View key={t + i} style={styles.dropLine}>
              <Text style={styles.dropRank}>{i + 1}</Text>
              <Text style={styles.dropTitle} numberOfLines={1}>
                {t}
              </Text>
            </View>
          ))}
          {drop.events.length > titles.length ? (
            <Text style={styles.dropMore}>+ {plural(drop.events.length - titles.length, 'autre idée', 'autres idées')}</Text>
          ) : null}
        </Card>
      </Pressable>
    </View>
  )
}

function ChallengeCard({ challenge, loggedIn }: { challenge: ClubResponse['challenge']; loggedIn: boolean }) {
  const p = challenge.progress
  return (
    <View style={styles.block}>
      <SectionHeader kicker="Le défi de la semaine" title={challenge.title} />
      <View style={{ paddingHorizontal: GUTTER }}>
        <Card>
          <T v="small">{challenge.text}</T>
          {p ? (
            <View style={{ marginTop: 12 }}>
              <ProgressBar value={p.value} max={p.goal} label={`Défi : ${p.value} sur ${p.goal}`} />
              <Text style={styles.challengeState}>{p.done ? 'Défi relevé, bravo.' : `${p.value} / ${p.goal}`}</Text>
            </View>
          ) : !loggedIn ? (
            <Text style={[styles.challengeState, { color: colors.textSecondary }]}>Connecte-toi pour suivre ta progression.</Text>
          ) : null}
          {challenge.ideas.length ? (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.ideasTitle}>Des lieux à essayer</Text>
              <View style={styles.ideas}>
                {challenge.ideas.map((v) => (
                  <Pressable
                    key={v.slug}
                    accessibilityRole="link"
                    accessibilityLabel={`${v.name}${v.arrondissement ? `, ${v.arrondissement}` : ''}`}
                    onPress={() => router.push({ pathname: '/lieux/[slug]', params: { slug: v.slug } })}
                    style={({ pressed }) => [styles.idea, { opacity: pressed ? 0.8 : 1 }]}>
                    <MapPin size={14} color={colors.accent} />
                    <Text style={styles.ideaText} numberOfLines={1}>
                      {v.name}
                      {v.arrondissement ? ` · ${v.arrondissement}` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </Card>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  block: { marginTop: 32 },
  night: { backgroundColor: colors.night, borderRadius: radius.xl, padding: 20 },
  nightKicker: { fontFamily: fonts.semibold, fontSize: 14, color: 'rgba(251,250,247,0.75)' },
  nightTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, letterSpacing: -0.4, color: colors.paper, marginTop: 4, flexShrink: 1 },
  nightText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: 'rgba(251,250,247,0.82)', marginTop: 8 },
  nightSubtitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.paper },
  nightLink: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentGlow },
  levelNumber: { fontFamily: fonts.display, fontSize: 48, lineHeight: 50, color: colors.accentGlow },
  badgesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  badges: { marginTop: 10, gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.nightSoft, borderRadius: radius.md, padding: 10 },
  badgeEmoji: { fontSize: 22 },
  badgeName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.paper },
  badgeDesc: { fontFamily: fonts.regular, fontSize: 13, color: 'rgba(251,250,247,0.7)', marginTop: 1 },
  rowCaption: { fontFamily: fonts.medium, fontSize: 12, color: colors.accent, marginLeft: 88, marginTop: -4, marginBottom: 6 },
  dropLead: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent, marginBottom: 6 },
  dropLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  dropRank: { fontFamily: fonts.display, fontSize: 18, color: colors.accent, width: 18 },
  dropTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, flex: 1 },
  dropMore: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary, marginTop: 6 },
  challengeState: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent, marginTop: 8 },
  ideasTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  idea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  ideaText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, flexShrink: 1 },
})


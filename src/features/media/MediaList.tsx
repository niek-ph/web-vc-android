import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CastButton } from 'react-native-google-cast';
import { SafeAreaView } from 'react-native-safe-area-context';
import { describeMedia, Media, Player, Subtitle } from './media';

type Props = {
  visible: boolean;
  media: Media[];
  players: Player[];
  connected: boolean;
  casting: boolean;
  inspecting: string | null;
  error: string | null;
  onClose: () => void;
  onScan: () => void;
  onPlayer: (player: Player) => void;
  onInspect: (media: Media) => void;
  onCast: (media: Media, subtitle?: Subtitle) => Promise<boolean>;
};
export function MediaList(props: Props) {
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      onRequestClose={props.onClose}
    >
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.grow}>
            <Text style={styles.heading}>Videos found</Text>
            <Text style={styles.muted}>
              {props.media.length}{' '}
              {props.media.length === 1 ? 'stream' : 'streams'} ·{' '}
              {props.players.length}{' '}
              {props.players.length === 1 ? 'player' : 'players'}
            </Text>
          </View>
          <CastButton style={styles.castIcon} />
          <Pressable
            accessibilityRole="button"
            onPress={props.onClose}
            style={styles.action}
          >
            <Text style={styles.link}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.muted}>
            Start playback in the page to reveal its streams. Open another
            player to find more versions; results are kept while you explore
            players.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={props.onScan}
            style={styles.action}
          >
            <Text style={styles.link}>Scan page again</Text>
          </Pressable>
          {props.error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {props.error}
            </Text>
          )}
          {!props.connected && (
            <Text style={styles.notice}>
              Connect to your TV using the Cast icon to select a stream.
            </Text>
          )}
          {props.media.length === 0 && (
            <View style={styles.card}>
              <Text style={styles.title}>No video streams found yet</Text>
              <Text style={styles.muted}>
                Choose a player below, then press Play on the website. Embedded
                players and video streams appear separately.
              </Text>
            </View>
          )}
          {props.media.map(media => (
            <MediaRow key={media.url} {...props} media={media} />
          ))}
          {props.players.length > 0 && (
            <Text style={styles.heading}>Players on this page</Text>
          )}
          {props.players.map((player, index) => (
            <View key={player.url} style={styles.card}>
              <Text style={styles.title}>
                {/^Player \d+$/i.test(player.label)
                  ? player.label
                  : `Player ${index + 1}`}
              </Text>
              <Text style={styles.muted}>{new URL(player.url).hostname}</Text>
              <Text style={styles.muted}>
                Format and subtitles become available after this player loads.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open player ${index + 1}`}
                style={styles.action}
                onPress={() => props.onPlayer(player)}
              >
                <Text style={styles.link}>Open player</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
function MediaRow({
  media,
  ...props
}: Omit<Props, 'media'> & { media: Media }) {
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const selected = media.subtitles.find(track => track.url === subtitleUrl);
  const disabled =
    !props.connected ||
    props.casting ||
    !!media.protected ||
    !!media.requiresMaster ||
    !media.mime;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{media.title}</Text>
      <Text style={styles.badge}>{media.label || media.format}</Text>
      <Text style={styles.muted}>{describeMedia(media)}</Text>
      {media.codecs && <Text style={styles.muted}>Codecs: {media.codecs}</Text>}
      <Text style={styles.muted} numberOfLines={1}>
        {new URL(media.url).hostname} · {media.source}
      </Text>
      <Text style={styles.subtitle}>Subtitles</Text>
      {media.subtitles.length ? (
        <>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: !selected }}
            style={styles.option}
            onPress={() => setSubtitleUrl(null)}
          >
            <Text style={styles.link}>
              {!selected ? '●' : '○'} No external subtitles
            </Text>
          </Pressable>
          {media.subtitles.map(track => (
            <Pressable
              key={track.url}
              accessibilityRole="radio"
              accessibilityState={{
                checked: selected?.url === track.url,
                disabled: track.format !== 'VTT',
              }}
              disabled={track.format !== 'VTT'}
              onPress={() => setSubtitleUrl(track.url)}
              style={styles.option}
            >
              <Text style={track.format === 'VTT' ? styles.link : styles.muted}>
                {selected?.url === track.url ? '●' : '○'} {track.label}
                {track.language ? ` (${track.language})` : ''} · {track.format}
              </Text>
              {track.format !== 'VTT' && (
                <Text style={styles.muted}>
                  {track.format === 'HLS'
                    ? 'Included in the HLS stream; availability depends on the receiver.'
                    : 'Detected; external Cast subtitles require WebVTT.'}
                </Text>
              )}
            </Pressable>
          ))}
        </>
      ) : (
        <Text style={styles.muted}>
          Not found yet. The player may load them after you enable captions.
        </Text>
      )}
      {media.requiresMaster && (
        <Text style={styles.notice}>
          Choose Auto quality to include this stream’s separate audio track.
        </Text>
      )}
      {media.protected && (
        <Text style={styles.error}>
          Protected stream: requires its own DRM-compatible player.
        </Text>
      )}
      {media.format === 'HLS' && (
        <Pressable
          accessibilityRole="button"
          disabled={!!props.inspecting}
          onPress={() => props.onInspect(media)}
          style={styles.action}
        >
          <Text style={styles.link}>
            {props.inspecting === media.url
              ? 'Reading playlist…'
              : 'Read qualities & subtitles'}
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Cast ${media.title} ${
          media.label || media.format
        }`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={[styles.cast, disabled && styles.disabled]}
        onPress={async () => {
          if (await props.onCast(media, selected)) props.onClose();
        }}
      >
        <Text style={styles.castText}>
          {props.casting ? 'Loading…' : 'Cast this video'}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderColor: '#334155',
  },
  grow: { flex: 1 },
  heading: { color: '#f8fafc', fontSize: 21, fontWeight: '700' },
  title: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },
  list: { padding: 18, gap: 16 },
  card: { padding: 16, borderRadius: 14, gap: 9, backgroundColor: '#1e293b' },
  muted: { color: '#94a3b8', fontSize: 13, lineHeight: 20 },
  link: { color: '#7dd3fc', fontSize: 14 },
  action: { paddingVertical: 12 },
  option: { paddingVertical: 8, gap: 4 },
  subtitle: { color: '#cbd5e1', fontWeight: '600', marginTop: 6 },
  badge: { color: '#7dd3fc', fontWeight: '700' },
  cast: {
    backgroundColor: '#7dd3fc',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 5,
  },
  castText: { color: '#082f49', fontWeight: '700' },
  disabled: { opacity: 0.35 },
  error: { color: '#fda4af', lineHeight: 21 },
  notice: { color: '#fde68a', lineHeight: 21 },
  castIcon: { width: 40, height: 40, tintColor: '#7dd3fc' },
});

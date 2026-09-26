import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CastButton } from 'react-native-google-cast';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { CastPanel } from '../cast/CastPanel';
import { useCastController } from '../cast/useCastController';
import { MediaList } from '../media/MediaList';
import { useMediaDiscovery } from '../media/useMediaDiscovery';
import { isWebUrl, toWebUrl } from './url';

export function BrowserScreen() {
  // WebView 14 defaults its extra-props generic to undefined, which intersects
  // to never with TypeScript 6. Use object to preserve its declared props.
  const webView = useRef<WebView<object>>(null);
  const [address, setAddress] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const crashed = useRef(false);
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cast = useCastController();
  const discovery = useMediaDiscovery();
  const [showMedia, setShowMedia] = useState(false);
  const source = useMemo(() => ({ uri: url || '' }), [url]);

  function finishLoading() {
    if (loadTimeout.current) {
      clearTimeout(loadTimeout.current);
      loadTimeout.current = null;
    }
    setLoading(false);
  }

  function beginLoading() {
    if (loadTimeout.current) {
      clearTimeout(loadTimeout.current);
    }
    setLoading(true);
    setError(null);
    loadTimeout.current = setTimeout(() => {
      webView.current?.stopLoading();
      setLoading(false);
      setError(
        'This page took too long to load. Check your connection and tap Reload.',
      );
    }, 30000);
  }

  function reload() {
    beginLoading();
    if (crashed.current) {
      crashed.current = false;
      setWebViewKey(key => key + 1);
    } else {
      webView.current?.reload();
    }
  }

  useEffect(
    () => () => {
      if (loadTimeout.current) {
        clearTimeout(loadTimeout.current);
      }
    },
    [],
  );

  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webView.current?.goBack();
        return true;
      }
      if (url) {
        setUrl(null);
        setAddress('');
        finishLoading();
        setError(null);
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [canGoBack, url]);

  function browse() {
    const nextUrl = toWebUrl(address);
    if (!nextUrl) {
      Alert.alert('Enter a website', 'Use a valid HTTP or HTTPS address.');
      return;
    }
    Keyboard.dismiss();
    if (nextUrl === url) {
      reload();
    } else {
      beginLoading();
      if (crashed.current) {
        crashed.current = false;
        setWebViewKey(key => key + 1);
      }
      discovery.startPage(nextUrl);
      setUrl(nextUrl);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Web VC</Text>
          <Text style={styles.subtitle}>Your web. Your big screen.</Text>
        </View>
        <CastButton
          accessibilityLabel="Connect to a Cast device"
          style={styles.castButton}
        />
      </View>
      <View style={styles.addressBar}>
        <TextInput
          accessibilityLabel="Website address"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setAddress}
          onSubmitEditing={browse}
          placeholder="Enter a website address"
          placeholderTextColor="#94a3b8"
          returnKeyType="go"
          selectTextOnFocus
          style={styles.input}
          value={address}
        />
        <Pressable
          accessibilityRole="button"
          onPress={browse}
          style={styles.go}
        >
          <Text style={styles.goText}>Go</Text>
        </Pressable>
      </View>
      <CastPanel controller={cast} />
      <MediaList
        visible={showMedia}
        media={discovery.media}
        players={discovery.players}
        connected={cast.connected}
        casting={cast.loading}
        inspecting={discovery.inspecting}
        error={discovery.scanError || cast.message}
        onClose={() => setShowMedia(false)}
        onScan={() =>
          webView.current?.injectJavaScript(
            'window.postMessage({webVCCommand: "scan"}, "*"); true;',
          )
        }
        onPlayer={player => {
          discovery.openPlayer();
          beginLoading();
          setUrl(player.url);
          setAddress(player.url);
          setShowMedia(false);
        }}
        onInspect={discovery.inspect}
        onCast={async (media, subtitle) => {
          const loaded = await cast.castMedia(media, subtitle);
          if (loaded)
            webView.current?.injectJavaScript(
              'window.postMessage({webVCCommand: "pause"}, "*"); true;',
            );
          return loaded;
        }}
      />
      <View style={styles.content}>
        {url ? (
          <>
            <View style={styles.toolbar}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canGoBack }}
                disabled={!canGoBack}
                onPress={() => webView.current?.goBack()}
                style={styles.toolbarButton}
              >
                <Text style={canGoBack ? styles.link : styles.muted}>Back</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowMedia(true)}
                style={styles.toolbarButton}
              >
                <Text style={styles.link}>
                  Videos ({discovery.media.length}) · Players (
                  {discovery.players.length})
                </Text>
              </Pressable>
              {loading && <ActivityIndicator color="#7dd3fc" size="small" />}
              <Pressable
                accessibilityRole="button"
                onPress={reload}
                style={styles.toolbarButton}
              >
                <Text style={styles.link}>Reload</Text>
              </Pressable>
            </View>
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            <WebView<object>
              key={webViewKey}
              ref={webView}
              source={source}
              style={styles.webView}
              onMessage={({ nativeEvent }) =>
                discovery.receive(nativeEvent.data)
              }
              javaScriptEnabled
              domStorageEnabled
              allowsFullscreenVideo
              allowFileAccess={false}
              mixedContentMode="never"
              // Handle every scheme here rather than opening external apps.
              originWhitelist={['*']}
              // Keep the page visible while loading. WebView's default opaque
              // spinner can otherwise hide a page indefinitely after reload.
              renderLoading={() => <View />}
              onShouldStartLoadWithRequest={request => isWebUrl(request.url)}
              // Keep popup advertisements from replacing the selected player.
              onOpenWindow={() => {}}
              onNavigationStateChange={navigation => {
                setCanGoBack(navigation.canGoBack);
                if (isWebUrl(navigation.url)) {
                  setAddress(navigation.url);
                }
              }}
              onLoadStart={beginLoading}
              onLoadProgress={({ nativeEvent }) => {
                if (nativeEvent.progress === 1) {
                  finishLoading();
                }
              }}
              onLoadEnd={finishLoading}
              onError={({ nativeEvent }) => {
                finishLoading();
                setError(
                  `Could not load this page: ${nativeEvent.description} (${nativeEvent.code}).`,
                );
              }}
              onHttpError={({ nativeEvent }) => {
                finishLoading();
                setError(
                  `The website returned HTTP ${nativeEvent.statusCode}. Try Reload or another website.`,
                );
              }}
              onRenderProcessGone={() => {
                finishLoading();
                crashed.current = true;
                setError(
                  'The browser stopped responding. Tap Reload to restart it.',
                );
              }}
            />
          </>
        ) : (
          <View style={styles.welcome}>
            <Text style={styles.eyebrow}>BROWSER + CHROMECAST</Text>
            <Text style={styles.heading}>Start with a website.</Text>
            <Text style={styles.body}>
              Open a page using the address bar, or connect to your TV and cast
              the sample video.
            </Text>
            <Text style={styles.note}>
              Open a video player and press Play. Tap Videos to choose a
              detected stream, inspect its format and subtitles, and cast it to
              your TV.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { color: '#f8fafc', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#94a3b8', marginTop: 4, fontSize: 13 },
  castButton: { width: 48, height: 48, tintColor: '#7dd3fc' },
  addressBar: {
    marginHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { flex: 1, color: '#f8fafc', minHeight: 52, paddingHorizontal: 14 },
  go: { padding: 16 },
  goText: { color: '#7dd3fc', fontWeight: '700' },
  content: { flex: 1, borderTopWidth: 1, borderTopColor: '#1e293b' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolbarButton: { padding: 14 },
  link: { color: '#7dd3fc' },
  muted: { color: '#64748b' },
  webView: { flex: 1 },
  error: { color: '#fda4af', padding: 14 },
  welcome: { flex: 1, justifyContent: 'center', padding: 28, gap: 16 },
  eyebrow: {
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  heading: {
    color: '#f8fafc',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  body: { color: '#cbd5e1', fontSize: 16, lineHeight: 25 },
  note: { color: '#94a3b8', fontSize: 13, lineHeight: 21 },
});

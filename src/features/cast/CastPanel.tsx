import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CastController } from './useCastController';

export function CastPanel({ controller }: { controller: CastController }) {
  const { connected, loading, message, title, description, castSample } =
    controller;
  return (
    <View style={styles.panel}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text
          accessibilityRole={message ? 'alert' : undefined}
          style={[styles.description, !!message && styles.error]}
        >
          {message ||
            (connected
              ? description
              : 'Tap the Cast icon. Use the same Wi-Fi as your TV.')}
        </Text>
      </View>
      <Pressable
        testID="cast-sample"
        accessibilityRole="button"
        accessibilityState={{ disabled: !connected || loading }}
        disabled={!connected || loading}
        onPress={castSample}
        style={[styles.button, (!connected || loading) && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Loading…' : 'Cast sample'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12, flexDirection: 'row', alignItems: 'center' },
  copy: { flex: 1, gap: 4 },
  title: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  description: { color: '#94a3b8', fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: '#7dd3fc', borderRadius: 10, padding: 12 },
  buttonText: { color: '#082f49', fontWeight: '700' },
  disabled: { opacity: 0.35 },
  error: { color: '#fda4af' },
});

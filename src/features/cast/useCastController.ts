import { useEffect, useRef, useState } from 'react';
import {
  MediaPlayerIdleReason,
  MediaPlayerState,
  useRemoteMediaClient,
} from 'react-native-google-cast';
import type { MediaLoadRequest, MediaStatus } from 'react-native-google-cast';
import { checkSampleAvailability, SAMPLE_REQUEST } from './sampleMedia';
import { mediaRequest } from '../media/castMedia';
import type { Media, Subtitle } from '../media/media';

export function useCastController() {
  const client = useRemoteMediaClient();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [description, setDescription] = useState(
    'Flower · 5-second test video (CC0)',
  );
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    let receivedStatusUpdate = false;
    setStatus(null);
    setError(null);
    setLoading(false);
    const subscription = client?.onMediaStatusUpdated(next => {
      receivedStatusUpdate = true;
      if (active) {
        setStatus(next);
      }
    });
    client?.getMediaStatus().then(
      next => active && !receivedStatusUpdate && setStatus(next),
      () => {}, // The session may disconnect while the initial status is read.
    );
    return () => {
      active = false;
      attempt.current += 1;
      request.current?.abort();
      subscription?.remove();
    };
  }, [client]);

  async function load(
    requestData: MediaLoadRequest,
    descriptionText: string,
    checkSample = false,
    subtitle = false,
  ): Promise<boolean> {
    if (!client || loading) return false;
    const currentAttempt = ++attempt.current;
    const controller = new AbortController();
    request.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setError(null);
    setStatus(null);
    setDescription(descriptionText);
    try {
      await Promise.race([
        (async () => {
          if (checkSample) await checkSampleAvailability(controller.signal);
          if (currentAttempt !== attempt.current || controller.signal.aborted)
            return;
          await client.loadMedia(requestData);
          if (
            subtitle &&
            currentAttempt === attempt.current &&
            !controller.signal.aborted
          )
            await client.setActiveTrackIds([1]);
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new Error(
                'The TV did not finish loading in time. Try another stream.',
              ),
            );
          }, 20000);
        }),
      ]);
      return currentAttempt === attempt.current && !controller.signal.aborted;
    } catch (failure) {
      if (currentAttempt === attempt.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load this video. Try another stream.',
        );
      return false;
    } finally {
      clearTimeout(timer!);
      if (currentAttempt === attempt.current) {
        request.current = null;
        setLoading(false);
      }
    }
  }
  async function castSample() {
    return load(SAMPLE_REQUEST, 'Flower · 5-second test video (CC0)', true);
  }
  async function castMedia(media: Media, subtitle?: Subtitle) {
    try {
      return await load(
        mediaRequest(media, subtitle),
        media.title,
        false,
        !!subtitle,
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Unsupported stream.',
      );
      return false;
    }
  }

  const receiverFailed =
    status?.playerState === MediaPlayerState.IDLE &&
    status.idleReason === MediaPlayerIdleReason.ERROR;
  const message =
    error ||
    (receiverFailed
      ? 'Your TV could not fetch or play the video. Try another stream; some sites require browser cookies or headers.'
      : null);
  const title = !client
    ? 'Connect to your TV'
    : message
    ? 'Playback failed'
    : loading || status?.playerState === MediaPlayerState.LOADING
    ? 'Loading on your TV…'
    : status?.playerState === MediaPlayerState.PLAYING
    ? 'Playing on your TV'
    : status?.playerState === MediaPlayerState.PAUSED
    ? 'Paused on your TV'
    : status?.playerState === MediaPlayerState.BUFFERING
    ? 'Buffering on your TV…'
    : status?.idleReason === MediaPlayerIdleReason.FINISHED
    ? 'Video finished'
    : 'Ready to cast';

  return {
    connected: !!client,
    loading,
    message,
    title,
    description,
    castSample,
    castMedia,
  };
}
export type CastController = ReturnType<typeof useCastController>;

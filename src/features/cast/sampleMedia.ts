import { MediaStreamType } from 'react-native-google-cast';
import type { MediaLoadRequest } from 'react-native-google-cast';

// MDN's public CC0 flower clip: a short MP4 with CORS and byte-range support.
// The old Google Big Buck Bunny sample now returns HTTP 403.
export const SAMPLE_URL =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

export const SAMPLE_REQUEST: MediaLoadRequest = {
  autoplay: true,
  mediaInfo: {
    contentUrl: SAMPLE_URL,
    contentType: 'video/mp4',
    streamType: MediaStreamType.BUFFERED,
    metadata: { type: 'movie', title: 'Flower — 5-second sample' },
  },
};

export async function checkSampleAvailability(signal: AbortSignal) {
  const response = await fetch(SAMPLE_URL, { method: 'HEAD', signal });
  if (!response.ok) {
    throw new Error(
      `The sample video is unavailable (HTTP ${response.status}).`,
    );
  }
  if (
    !response.headers.get('content-type')?.toLowerCase().startsWith('video/')
  ) {
    throw new Error(
      'The sample URL did not return a video. Please try again later.',
    );
  }
}

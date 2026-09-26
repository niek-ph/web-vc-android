import { MediaStreamType } from 'react-native-google-cast';
import type { MediaLoadRequest } from 'react-native-google-cast';
import { Media, Subtitle } from './media';

export function mediaRequest(
  media: Media,
  subtitle?: Subtitle,
): MediaLoadRequest {
  if (media.requiresMaster)
    throw new Error('Choose Auto quality to include the separate audio track.');
  if (media.protected)
    throw new Error('This stream needs its own DRM-compatible player.');
  if (!media.mime)
    throw new Error(
      'The media format is not known yet. Start the video in the page first.',
    );
  if (subtitle && subtitle.format !== 'VTT')
    throw new Error('Only direct WebVTT subtitles can be added to Cast.');
  return {
    autoplay: true,
    mediaInfo: {
      contentUrl: media.url,
      contentType: media.mime,
      streamType: media.live ? MediaStreamType.LIVE : MediaStreamType.BUFFERED,
      metadata: { type: 'movie', title: media.title },
      ...(subtitle
        ? {
            mediaTracks: [
              {
                id: 1,
                type: 'text',
                subtype: 'subtitles',
                contentId: subtitle.url,
                contentType: 'text/vtt',
                name: subtitle.label,
                language: subtitle.language || 'und',
              },
            ],
          }
        : {}),
    },
  };
}

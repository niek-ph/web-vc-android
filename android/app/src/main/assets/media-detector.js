/* eslint-env browser */
/* global WebVCScanner */
(function installMediaDetector() {
  if (window.__webVCDetector) {
    window.__webVCDetector.scan();
    return;
  }
  var sent = new Map();
  var pending;
  function absolute(value) {
    try {
      var url = new URL(value, document.baseURI);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password
        ? url.href
        : '';
    } catch (_) {
      return '';
    }
  }
  function kind(url, mime) {
    if (
      /\.(ts|m4s|aac)(?:[?#]|$)/i.test(url) ||
      /^(video\/mp2t|audio\/)/i.test(mime || '')
    )
      return '';
    if (
      /\.(vtt|srt|ttml)(?:[?#]|$)/i.test(url) ||
      /text\/vtt|ttml/i.test(mime || '')
    )
      return 'subtitle';
    if (
      /\.(mp4|m4v|webm|m3u8|mpd)(?:[?#]|$)/i.test(url) ||
      /video\/|mpegurl|dash\+xml|^hls$|^dash$/i.test(mime || '')
    )
      return 'media';
    return '';
  }
  function send(data) {
    if (!window.WebVCScanner || sent.size > 500) return;
    data.frameUrl = location.href;
    data.title = data.title || document.title;
    var message = JSON.stringify(data);
    var key = data.type + ':' + (data.url || '');
    if (message.length > 262144 || sent.get(key) === message) return;
    sent.set(key, message);
    WebVCScanner.postMessage(message);
  }
  function discover(value, details) {
    var url = absolute(value);
    if (!url) return;
    var type =
      details && /^(captions|subtitles)$/.test(details.kind)
        ? 'subtitle'
        : kind(url, details && details.mime);
    if (type) send(Object.assign({ type: type, url: url }, details));
  }
  function tracks(video) {
    return Array.from(
      video.querySelectorAll(
        'track[kind="subtitles"], track[kind="captions"], track:not([kind])',
      ),
    )
      .map(function (track) {
        return {
          url: absolute(track.src),
          label: track.label,
          language: track.srclang,
          mime: 'text/vtt',
        };
      })
      .filter(function (track) {
        return track.url;
      });
  }
  function scan() {
    document.querySelectorAll('video').forEach(function (video) {
      var details = {
        source: 'video',
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        subtitles: tracks(video),
      };
      var urls = [video.currentSrc, video.getAttribute('src')];
      video.querySelectorAll('source').forEach(function (source) {
        discover(source.src, Object.assign({}, details, { mime: source.type }));
        urls.push(source.src);
      });
      urls.filter(Boolean).forEach(function (url) {
        // An extensionless video src is still a confirmed media element.
        var resolved = absolute(url);
        if (resolved)
          send(Object.assign({ type: 'media', url: resolved }, details));
      });
      details.subtitles.forEach(function (track) {
        send(Object.assign({ type: 'subtitle' }, track));
      });
    });
    document.querySelectorAll('a[href], source[src]').forEach(function (node) {
      discover(node.href || node.src, { mime: node.type, source: 'page' });
    });
    document
      .querySelectorAll('iframe, [data-player-url]')
      .forEach(function (node) {
        var value =
          node.getAttribute('data-player-url') ||
          node.getAttribute('data-src') ||
          node.getAttribute('src');
        var url = value && absolute(value);
        if (url && url !== location.href)
          send({
            type: 'player',
            url: url,
            label: (node.textContent || node.title || '').trim().slice(0, 80),
            source: 'embedded player',
          });
        try {
          if (node.contentWindow && node.contentDocument) {
            node.contentWindow.eval(
              '(' + installMediaDetector.toString() + ')()',
            );
          }
        } catch (_) {
          /* Cross-origin frames receive the native document-start script. */
        }
      });
    try {
      if (typeof window.jwplayer === 'function') {
        inspect(window.jwplayer().getPlaylist(), 0);
      }
    } catch (_) {
      /* Player may not have initialized. */
    }
  }
  function inspect(value, depth) {
    if (!value || depth > 6) return;
    if (typeof value === 'string') {
      if (/^https?:|^\/|^\.\.?\//i.test(value))
        discover(value, { source: 'player data' });
    } else if (typeof value === 'object') {
      var url = value.file || value.src || value.url;
      if (typeof url === 'string')
        discover(url, {
          source: 'player data',
          label: value.label || value.name,
          language: value.srclang || value.language || value.lang,
          mime: value.type,
          kind: value.kind,
          title: value.title,
        });
      Object.keys(value)
        .slice(0, 100)
        .forEach(function (key) {
          inspect(value[key], depth + 1);
        });
    }
  }
  function inspectBody(url, mime, body) {
    if (typeof body !== 'string' || body.length > 200000) return;
    if (/^\s*#EXTM3U/.test(body)) {
      send({
        type: 'manifest',
        url: absolute(url),
        mime: 'application/vnd.apple.mpegurl',
        body: body,
      });
    } else if (/json/i.test(mime)) {
      try {
        inspect(JSON.parse(body), 0);
      } catch (_) {
        /* Non-JSON error body. */
      }
    }
  }
  if (window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function () {
      return originalFetch.apply(this, arguments).then(function (response) {
        var mime = response.headers.get('content-type') || '';
        discover(response.url, { mime: mime, source: 'network' });
        if (
          /json|mpegurl/.test(mime) ||
          /\.m3u8(?:[?#]|$)/i.test(response.url)
        ) {
          var copy = response.clone();
          if (copy.body && copy.body.getReader) {
            var reader = copy.body.getReader();
            var decoder = new TextDecoder();
            var text = '';
            var read = function () {
              reader
                .read()
                .then(function (chunk) {
                  if (chunk.done) {
                    inspectBody(response.url, mime, text);
                    return;
                  }
                  text += decoder.decode(chunk.value, { stream: true });
                  if (text.length > 200000) {
                    reader.cancel().catch(function () {});
                    return;
                  }
                  read();
                })
                .catch(function () {});
            };
            read();
          }
        }
        return response;
      });
    };
  }
  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    this.addEventListener(
      'load',
      function () {
        var mime = this.getResponseHeader('content-type') || '';
        discover(this.responseURL, { mime: mime, source: 'network' });
        if (
          /json|mpegurl/.test(mime) ||
          /\.m3u8(?:[?#]|$)/i.test(this.responseURL)
        ) {
          try {
            if (this.responseType === 'json') inspect(this.response, 0);
            else inspectBody(this.responseURL, mime, this.responseText);
          } catch (_) {
            /* Binary response. */
          }
        }
      },
      { once: true },
    );
    return originalOpen.apply(this, arguments);
  };
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        discover(entry.name, { source: 'network' });
      });
    }).observe({ type: 'resource', buffered: true });
  } catch (_) {
    /* Older WebViews still use the native request observer. */
  }
  function scheduleScan() {
    clearTimeout(pending);
    pending = setTimeout(scan, 350);
  }
  new MutationObserver(scheduleScan).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'href', 'data-src', 'data-player-url'],
  });
  document.addEventListener('loadedmetadata', scheduleScan, true);
  document.addEventListener('play', scheduleScan, true);
  document.addEventListener('DOMContentLoaded', scheduleScan);
  window.addEventListener('message', function (event) {
    var command = event.data && event.data.webVCCommand;
    if (command !== 'scan' && command !== 'pause') return;
    if (command === 'scan') scan();
    else
      document.querySelectorAll('video, audio').forEach(function (video) {
        video.pause();
      });
    for (var i = 0; i < window.frames.length; i++)
      window.frames[i].postMessage({ webVCCommand: command }, '*');
  });
  window.__webVCDetector = { scan: scan };
  scheduleScan();
})();

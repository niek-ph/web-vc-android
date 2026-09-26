// Manual integration fixture: open http://10.0.2.2:8082 in the Android emulator.
// Two ports exercise cross-origin frame detection. No project files are served.
const http = require('node:http');
const host = process.env.MEDIA_FIXTURE_HOST || '10.0.2.2';
const bind = process.env.MEDIA_FIXTURE_HOST ? '0.0.0.0' : '127.0.0.1';
const video =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const servers = [8082, 8083].map(port =>
  http
    .createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.url === '/nl.vtt') {
        res.writeHead(200, { 'Content-Type': 'text/vtt' });
        res.end(
          'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nEen bloem in de wind.\n',
        );
      } else if (req.url === '/frame') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          `<!doctype html><title>Flower caption test</title><meta name="viewport" content="width=device-width"><video style="width:100%" crossorigin="anonymous" controls preload="metadata"><source src="${video}" type="video/mp4"><track kind="subtitles" src="/nl.vtt" srclang="nl" label="Nederlands"></video>`,
        );
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          `<!doctype html><title>Media discovery fixture</title><meta name="viewport" content="width=device-width"><h1>Frame detection test</h1><p>One MP4, Dutch WebVTT subtitles, separate iframe origin.</p><iframe title="Caption test player" src="http://${host}:8083/frame" style="width:100%;height:350px;border:0"></iframe>`,
        );
      }
    })
    .listen(port, bind),
);
console.log(`Media fixture: http://${host}:8082. Ctrl+C stops both servers.`);
process.on('SIGINT', () => {
  servers.forEach(server => server.close());
});

const https = require('https');
const options = { headers: { 'User-Agent': 'node' } };
https.get('https://api.github.com/repos/fghrsh/live2d_demo/contents/assets', options, (res) => {
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => {
    const js = JSON.parse(body);
    console.log(js.map((i) => i.name));
  });
});

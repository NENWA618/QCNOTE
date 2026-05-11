import * as https from 'https';

interface GithubContentItem {
  name: string;
  [key: string]: unknown;
}

const options = { headers: { 'User-Agent': 'node' } };
https.get(
  'https://api.github.com/repos/fghrsh/live2d_demo/contents/assets',
  options,
  (res) => {
    let body = '';
    res.on('data', (c: string) => (body += c));
    res.on('end', () => {
      const js: GithubContentItem[] = JSON.parse(body);
      console.log(js.map((i) => i.name));
    });
  }
);

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

interface ModelJson {
  model?: string;
  textures?: string[];
  motions?: Record<string, Array<{ file: string }>>;
  physics?: string;
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(
            new Error(
              `Download failed: ${url} status code ${res.statusCode}`
            )
          );
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

async function run(): Promise<void> {
  const modelDir = path.join(
    __dirname,
    '../public/live2d/koharu'
  );
  const baseUrl =
    'https://raw.githubusercontent.com/xiazeyu/live2d-widget-models/master/packages/live2d-widget-model-koharu/assets/';

  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }

  const modelPath = path.join(modelDir, 'koharu.model.json');
  const modelUrl = baseUrl + 'koharu.model.json';

  console.log('下载模型配置:', modelUrl);
  await download(modelUrl, modelPath);

  const modelJsonContent = fs.readFileSync(modelPath, 'utf8');
  const modelJson: ModelJson = JSON.parse(modelJsonContent);

  // Download textures
  for (const tex of modelJson.textures || []) {
    const texUrl = baseUrl + tex;
    const texPath = path.join(modelDir, tex);
    const texDir = path.dirname(texPath);
    if (!fs.existsSync(texDir)) {
      fs.mkdirSync(texDir, { recursive: true });
    }
    console.log('下载纹理:', texUrl);
    await download(texUrl, texPath);
  }

  // Download motions
  for (const motionType in modelJson.motions || {}) {
    for (const motion of modelJson.motions?.[motionType] || []) {
      const motionUrl = baseUrl + motion.file;
      const motionPath = path.join(modelDir, motion.file);
      const motionDir = path.dirname(motionPath);
      if (!fs.existsSync(motionDir)) {
        fs.mkdirSync(motionDir, { recursive: true });
      }
      console.log('下载动作:', motionUrl);
      await download(motionUrl, motionPath);
    }
  }

  // Download physics if exists
  if (modelJson.physics) {
    const physicsUrl = baseUrl + modelJson.physics;
    const physicsPath = path.join(modelDir, modelJson.physics);
    console.log('下载物理:', physicsUrl);
    await download(physicsUrl, physicsPath);
  }

  // Download moc file
  if (modelJson.model) {
    const mocUrl = baseUrl + modelJson.model;
    const mocPath = path.join(modelDir, modelJson.model);
    const mocDir = path.dirname(mocPath);
    if (!fs.existsSync(mocDir)) {
      fs.mkdirSync(mocDir, { recursive: true });
    }
    console.log('下载模型:', mocUrl);
    await download(mocUrl, mocPath);
  }

  console.log('下载完成，本地模型已准备：', modelDir);
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

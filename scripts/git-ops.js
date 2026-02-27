const { execSync } = require('child_process');

try {
  const status = execSync('git status --porcelain', { encoding: 'utf8' });
  console.log('STATUS:\n' + status);
  execSync('git add -A', { stdio: 'inherit' });
  execSync('git commit -m "fix: correct App Router Server/Client Component configuration"', { stdio: 'inherit' });
  execSync('git push origin main', { stdio: 'inherit' });
} catch (err) {
  console.error('ERROR', err.message);
  process.exit(1);
}
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const appName = 'Local Todo.app';
const projectRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(projectRoot, 'desktop-release');
const destination = path.join('/Applications', appName);

const findBuiltApp = () => {
  if (!fs.existsSync(releaseRoot)) {
    throw new Error(`Missing release directory: ${releaseRoot}`);
  }

  const candidates = fs.readdirSync(releaseRoot)
    .filter((entry) => entry.startsWith('mac'))
    .map((entry) => path.join(releaseRoot, entry, appName))
    .filter((candidate) => fs.existsSync(candidate));

  if (candidates.length === 0) {
    throw new Error(`Could not find ${appName} under ${releaseRoot}`);
  }

  candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return candidates[0];
};

const source = findBuiltApp();

if (fs.existsSync(destination)) {
  fs.rmSync(destination, { recursive: true, force: true });
}

execFileSync('ditto', [source, destination], { stdio: 'inherit' });

console.log(`Installed ${source} to ${destination}`);

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { extractFile } = require('@electron/asar');

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

const validateBuiltApp = (appPath) => {
  const appAsarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');

  if (!fs.existsSync(appAsarPath)) {
    throw new Error(`Missing packaged Electron app: ${appAsarPath}`);
  }

  let packagedMetadata;
  try {
    packagedMetadata = JSON.parse(extractFile(appAsarPath, 'package.json').toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid packaged Electron app at ${appAsarPath}: ${error.message}`);
  }

  if (packagedMetadata.main !== 'desktop/main.cjs') {
    throw new Error(
      `Unexpected packaged Electron entry point: ${packagedMetadata.main || 'missing'}`,
    );
  }

  for (const requiredFile of ['desktop/main.cjs', 'dist/index.html']) {
    if (extractFile(appAsarPath, requiredFile).length === 0) {
      throw new Error(`Empty packaged Electron file: ${requiredFile}`);
    }
  }
};

validateBuiltApp(source);

if (fs.existsSync(destination)) {
  fs.rmSync(destination, { recursive: true, force: true });
}

execFileSync('ditto', [source, destination], { stdio: 'inherit' });

console.log(`Installed ${source} to ${destination}`);

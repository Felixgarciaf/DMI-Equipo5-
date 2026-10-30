// Test-only disk adapter: separate Node processes cannot share application memory.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

const { IncidentStorage } = require('../../src/security/incidentStorage.ts');
const [mode, directory, fixturePath] = process.argv.slice(2);
const adapter = {
  async getItem(key) {
    const filename = path.join(directory, key);
    return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : null;
  },
  async setItem(key, value) { fs.writeFileSync(path.join(directory, key), value); },
  async removeItem(key) { fs.rmSync(path.join(directory, key), { force: true }); },
};

async function run() {
  const storage = new IncidentStorage(adapter);
  if (mode === 'write') {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    await storage.read(fixture.incidents);
    await storage.savePendingChange(fixture.operation);
  }
  process.stdout.write(JSON.stringify(await storage.read()));
}

run().catch((error) => {
  process.stderr.write(error.message);
  process.exitCode = 1;
});

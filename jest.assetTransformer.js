// Plain-Node Jest projects: a required image becomes its repository path (a distinct string per
// file), the way the production art registry (src/themes/elevator-quest/art/sources.ts) is read in
// theme tests. Nothing is decoded here: artFiles.test.ts reads and checks the files themselves.
/* global __dirname */
const path = require('node:path');

module.exports = {
  process(_src, filename) {
    return { code: `module.exports = ${JSON.stringify(path.relative(__dirname, filename).split(path.sep).join('/'))};` };
  },
};

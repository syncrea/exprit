// Deliberately non-strict host code: sloppy-mode functions expose
// `caller` and `arguments`, which expressions must never be able to read.
const SECRET = 'sk-live-SECRET';

function step(cb) {
  return cb();
}

function runWithSecret(secret, cb) {
  return step(cb);
}

function start(cb) {
  return runWithSecret(SECRET, cb);
}

module.exports = { step, start };

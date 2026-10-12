/**
 * Container-mode entrypoint: the only file that binds a port.
 *
 * app.js stays port-agnostic (it exports the express app), which is what lets `test/run.js` bind
 * its own port locally. Here the platform injects `PORT`; 3000 is the documented CloudRun default
 * and the value the service is configured with.
 *
 * Binding 0.0.0.0 rather than the default is required — a loopback bind passes no readiness probe.
 */
const app = require('./app');

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`shaki-crawl listening on 0.0.0.0:${PORT}`);
});

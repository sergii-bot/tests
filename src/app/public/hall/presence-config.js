// Where other visitors are relayed from.
// Local (node src/app/server.mjs): leave empty, the game uses the same server it was loaded from.
// GitHub Pages (static, no server): paste the deployed Cloudflare Worker address here, e.g.
//   export const PRESENCE_URL = 'wss://skild-lab-presence.<your-subdomain>.workers.dev';
// (deploy it from presence-worker/: npx wrangler login, then npx wrangler deploy)
export const PRESENCE_URL = '';

import { TetrioApi } from '../src/net/api.js';
async function main() {
  const api = new TetrioApi();
  await api.getEnvironment();
  await api.anonymousJoin('tui-apitest');
  const menu = await api.get('/api/rooms/menu');
  console.log(JSON.stringify(menu).slice(0, 800));
}
main().catch(e => console.error(e));

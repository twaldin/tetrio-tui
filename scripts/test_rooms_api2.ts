import { TetrioApi } from '../src/net/api.js';
async function main() {
  const api = new TetrioApi();
  await api.getEnvironment();
  await api.anonymousJoin('tui-apitest');
  for (const path of ['/api/rooms/', '/api/rooms/list', '/api/rooms/public', '/api/rooms?limit=20']) {
    try {
      const r = await api.get(path);
      console.log(path, '=>', JSON.stringify(r).slice(0, 400));
    } catch (e: any) {
      console.log(path, '=> ERR', e.status, JSON.stringify(e.body).slice(0, 120));
    }
  }
}
main().catch(e => console.error(e));

import { getNats } from '.';

export async function initNatsStream() {
  const { nc } = await getNats();

  const jsm = await nc.jetstreamManager();

  try {
    await jsm.streams.info('ULOGS_LOGS');
    return;
  } catch {
    await jsm.streams.add({
      name: 'ULOGS_LOGS',
      subjects: ['logs.ingest'],
      retention: 'workqueue',
      storage: 'file',
      max_age: 0,
      max_msgs: -1,
    });
    console.log('JetStream stream ULOGS_LOGS initialized');
  }
}

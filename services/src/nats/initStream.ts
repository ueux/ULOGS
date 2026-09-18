import { getNats } from ".";

export async function initNatsStream() {
    const { nc } = await getNats();

    const jsm = await nc.jetstreamManager();

    await jsm.streams.add({
        name: 'ULOGS_LOGS',
        subjects: ['logs. ingest'],
        retention: 'workqueue',
        storage: 'file',
        max_age: 0,
        max_msgs: -1,
    })
    console.log('JetStream stream OML_LOGS initialized');
}
import { getNats } from '.';

export async function initNatsStream() {
  const { nc } = await getNats();
  const streamName = 'ULOGS_LOGS';
  const subjects = ['logs.ingest', 'logs.alert.evaluate'];
  const jsm = await nc.jetstreamManager();

  try {
    const existing = await jsm.streams.info(streamName);
    const existingSubjects = existing.config.subjects ?? [];

    const missingSubjects = subjects.filter(
      (subject) => !existingSubjects.includes(subject),
    );
    if (missingSubjects.length > 0) {
      await jsm.streams.update(streamName, {
        ...existing.config,
        subjects: [...existingSubjects, ...missingSubjects],
      });
      console.log(`JetStream stream ${streamName} updated`);
    }
    console.log(`JetStream stream ${streamName} ready`);
    return;
  } catch (error: any) {
    if (error?.code !== '404') throw error;
  }
  await jsm.streams.add({
    name: 'ULOGS_LOGS',
    subjects,
    retention: 'workqueue',
    storage: 'file',
    max_age: 0,
    max_msgs: -1,
  });
  console.log('JetStream stream ULOGS_LOGS initialized');
}

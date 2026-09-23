// import { startAlertConsumer } from '../nats/alert.consumer';
import { startAlertConsumer } from '../nats/alert.consumer';
import { startLogsConsumer } from '../nats/consumer';

export async function startWorkers() {
  void startLogsConsumer().catch((error) => {
    console.error('ULOGS Logs Consumer failed to start', error);
  });

  void startAlertConsumer().catch((error)=> {
  console.error('ULOGS Alert Consumer failed to start', error);
  });
}

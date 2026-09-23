// import { startAlertConsumer } from '../nats/alert.consumer';
import { startLogsConsumer } from '../nats/consumer';

export async function startWorkers() {
  void startLogsConsumer().catch((error) => {
    console.error('OML Logs Consumer failed to start', error);
  });

  // void startAlertConsumer().catch((error)=> {
  // console.error('OML Alert Consumer failed to start', error);
  // });
}

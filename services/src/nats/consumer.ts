import { consumerOpts } from "nats";
import { getNats } from ".";

export async function startLogsConsumer() {
    const { nc, jc } = await getNats();
    const js = nc.jetstream();
    const jsm = await nc.jetstreamManager();

    const durable = 'ulogs-log-worker';
    const subject = 'logs. ingest';
    const streamName = 'ULOGS_LOGS';

    const opts = consumerOpts();
    opts.durable(durable);
    opts.manualAck();
    opts.ackExplicit();
    opts.deliverTo('ulogs.logs.worker');
}
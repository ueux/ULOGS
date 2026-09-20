import { connect, JSONCodec } from 'nats';
const jc = JSONCodec();
let natsConnection: any = null;

export async function getNats() {
  if (!natsConnection) {
    natsConnection = await connect({
      servers: process.env.NATS_URL || 'nats://localhost:4222',
      name: 'ulogs-server',
    });
    console.log('Connected to Nats');
  }
  return { nc: natsConnection, jc };
}

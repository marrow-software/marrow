import { Container } from "cloudflare:workers";

export class MarrowAPI extends Container {
  defaultPort = 8000;
}

export default {
  async fetch(request, env) {
    const id = env.MARROW_API.idFromName("singleton");
    const stub = env.MARROW_API.get(id);
    return stub.fetch(request);
  },
};

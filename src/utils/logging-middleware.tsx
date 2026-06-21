import { createMiddleware } from "@tanstack/react-start";

const preLogMiddleware = createMiddleware({ type: "function" })
  .client((ctx) => {
    const clientTime = new Date();

    return ctx.next({
      context: {
        clientTime,
      },
      sendContext: {
        clientTime,
      },
    });
  })
  .server((ctx) => {
    const serverTime = new Date();

    return ctx.next({
      sendContext: {
        durationToServer:
          serverTime.getTime() - ctx.context.clientTime.getTime(),
        serverTime,
      },
    });
  });

export const logMiddleware = createMiddleware({ type: "function" })
  .middleware([preLogMiddleware])
  .client(async (ctx) => {
    const res = await ctx.next();

    const now = new Date();
    console.log("Client Req/Res:", {
      duration: now.getTime() - res.context.clientTime.getTime(),
      durationFromServer: now.getTime() - res.context.serverTime.getTime(),
      durationToServer: res.context.durationToServer,
    });

    return res;
  });

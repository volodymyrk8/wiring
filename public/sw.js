self.addEventListener("push", (event) => {
  let payload = { title: "WIRING", body: "Новое уведомление", url: "/", tag: "wiring" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (err) {
    /* keep defaults */
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((client) => client.visibilityState === "visible")) return;
      await self.registration.showNotification(payload.title || "WIRING", {
        body: payload.body || "",
        icon: "/public/icon-180.png",
        data: { url: payload.url || "/" },
        tag: payload.tag || "wiring",
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch (err) {
              /* older browsers */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

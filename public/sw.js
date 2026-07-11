// RAIOS Service Worker — handles push notifications and background sync
const CACHE_VERSION = "raios-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Handle push notifications sent from the server
self.addEventListener("push", function (event) {
  const data = event.data
    ? event.data.json()
    : { title: "RAIOS Alert", body: "Check your portfolio" };

  event.waitUntil(
    self.registration.showNotification(data.title || "RAIOS", {
      body: data.body || "",
      icon: "/globe.svg",
      badge: "/globe.svg",
      tag: data.tag || "raios-alert",
      vibrate: [200, 100, 200],
      requireInteraction: data.requireInteraction ?? false,
      data: { url: data.url || "/dashboard" },
    })
  );
});

// Clicking a notification opens/focuses the app
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(targetUrl));
        if (existing) return existing.focus();
        return self.clients.openWindow(targetUrl);
      })
  );
});

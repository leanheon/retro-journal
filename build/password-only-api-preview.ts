import type { Plugin } from "vite";

// The blog API authenticates with its password session. Prevent Vinext's
// development-only origin gate from adding a second authentication condition.
export function passwordOnlyApiPreview(): Plugin {
  return {
    name: "blog-password-only-api-preview",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if ((request.url ?? "").split("?")[0].startsWith("/api/")) {
          const ignored = new Set(["origin", "referer", "sec-fetch-site", "sec-fetch-mode"]);
          for (const name of ignored) delete request.headers[name];
          const raw = request.rawHeaders;
          for (let index = raw.length - 2; index >= 0; index -= 2) {
            if (ignored.has(raw[index].toLowerCase())) raw.splice(index, 2);
          }
        }
        next();
      });
    },
  };
}

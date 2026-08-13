/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // 3D models. Files in `public/` are otherwise revalidated on every
        // load, which costs a round trip per GLB — 17 of them for one scene.
        //
        // Not `immutable`: these filenames are stable across rebuilds, so an
        // immutable cache would pin visitors to a stale house until they
        // hard-refreshed. `stale-while-revalidate` gives an instant load from
        // cache while a changed model is fetched in the background, so a
        // redeploy reaches everyone within the hour without a version bump.
        //
        // If you ever need instant propagation, version the directory
        // (`/models/v2/...`, set in house/houseConfig.js) and switch this to
        // `max-age=31536000, immutable`.
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=604800",
          },
        ],
      },
      {
        // Draco decoder. Vendored from the `three` package and only changes
        // when three is upgraded, so it can be cached hard.
        source: "/draco/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Textures.
        source: "/textures/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

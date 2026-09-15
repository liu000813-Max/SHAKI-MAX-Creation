/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Sandbox bulk-delete guard blocks Next's cleanDistDir fs.rm of the cache dir.
  // Disabling it lets `next build` finish the static export without aborting.
  cleanDistDir: false,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

module.exports = nextConfig;

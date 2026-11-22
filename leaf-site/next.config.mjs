/** Static export served from https://saga.proxima-3d.com/leaf/ (GitHub Pages, repo root). */
const nextConfig = {
  output: 'export',
  basePath: '/leaf',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BASE_PATH: '/leaf' },
}
export default nextConfig

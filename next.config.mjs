/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // Keep the framework request-body limits above the library's 100 MB
    // per-file limit so multipart uploads are handled by our own Busboy
    // validation instead of being rejected early with HTTP 413.
    middlewareClientMaxBodySize: "110mb",
    serverActions: {
      bodySizeLimit: "110mb",
      allowedOrigins: ["localhost:3000"]
    }
  }
};

export default nextConfig;

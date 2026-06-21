import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* React Compiler disabled — caused a client-side render crash in the admin dashboard */
  reactCompiler: false,
};

export default nextConfig;

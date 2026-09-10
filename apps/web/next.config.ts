import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@floodops/scoring"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": ["./../../data/**/*"],
  },
  outputFileTracingExcludes: {
    "/*": ["./../../data/validation/photo_train_set/images/**/*"],
  },
};

export default nextConfig;

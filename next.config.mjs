import { withWorkflow } from "workflow/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright includes native Chromium helpers. It must run as a Node dependency at
  // workflow-step runtime, not be parsed by Next's webpack bundle.
  experimental: {
    serverComponentsExternalPackages: ["playwright-core", "@browserbasehq/sdk"]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      }
    ]
  }
};

// workflow@4 also configures Turbopack. This app is currently on Next 14, whose
// config schema predates that key; Webpack is the default here and has already
// received the workflow loader. Strip only the unsupported Turbopack section so
// production builds stay warning-free until the planned Next upgrade.
const buildWorkflowConfig = withWorkflow(nextConfig);

export default async function workflowConfig(phase, context) {
  const config = await buildWorkflowConfig(phase, context);
  delete config.turbopack;
  return config;
}

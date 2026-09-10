import type {NextConfig} from "next";
const nextConfig:NextConfig={
 async headers(){return [{source:"/:path*",headers:[{key:"X-Content-Type-Options",value:"nosniff"},{key:"Referrer-Policy",value:"no-referrer"},{key:"X-Frame-Options",value:"DENY"}]},{source:"/api/:path*",headers:[{key:"Cache-Control",value:"private, no-store"}]}];}
};
export default nextConfig;

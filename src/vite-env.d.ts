/// <reference types="vite/client" />

declare module "~react-pages" {
  import type { RouteObject } from "react-router-dom";

  const routes: RouteObject[];
  export default routes;
}
/// <reference types="vite-plugin-pages/client" />

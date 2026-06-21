import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

const getData = createServerFn().handler(() => ({
  message: `Running in ${navigator.userAgent}`,
  myVar: env.MY_VAR,
}));

const Home = () => (
  <div className="p-2">
    <h3>Welcome Home!!!</h3>
  </div>
);

export const Route = createFileRoute("/")({
  component: Home,
  loader: () => getData(),
});

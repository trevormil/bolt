// Quick manual/live check of the router. Usage:
//   bun run packages/llm/src/cli.ts "your prompt here"          (routes by length)
//   bun run packages/llm/src/cli.ts --frontier "hard question"  (force frontier)
import { complete, type Tier } from "./router.ts";

const args = process.argv.slice(2);
let tier: Tier | undefined;
if (args[0] === "--frontier") {
  tier = "frontier";
  args.shift();
} else if (args[0] === "--cheap") {
  tier = "cheap";
  args.shift();
}
const prompt = args.join(" ") || "Reply with exactly: pong";

const { text, meter } = await complete([{ role: "user", content: prompt }], {
  tier,
});
console.log(text);
console.error(JSON.stringify(meter));

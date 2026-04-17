import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { Stream } from "@elysiajs/stream";
import * as dotenv from "dotenv";
import { Engine } from "../../core/src/engine.ts";
import { GitHubProvider } from "../../providers/src/github.ts";
import { FacebookProvider } from "../../providers/src/facebook.ts";
import { RedditProvider } from "../../providers/src/reddit.ts";
import { InstagramProvider } from "../../providers/src/instagram.ts";
import { TwitterProvider } from "../../providers/src/twitter.ts";
import { GoogleSearchProvider } from "../../providers/src/google.ts";
import { GravatarProvider } from "../../providers/src/gravatar.ts";
import { PhoneLookupProvider } from "../../providers/src/phone.ts";
import type { QueryType } from "../../sdk/src/types.ts";

dotenv.config();

const app = new Elysia()
  .use(cors())
  .get("/", () => "Sherlock Holmes API is running")

  /**
   * SSE Endpoint for real-time scanning
   */
  .get("/api/scan", ({ query }) => {
    const { value, type = "username" } = query;
    if (!value) return "Missing value";

    return new Stream(async (stream) => {
      const engine = new Engine({
        providers: [
          new GitHubProvider(),
          new FacebookProvider(),
          new RedditProvider(),
          new InstagramProvider(),
          new TwitterProvider(),
          new GoogleSearchProvider(),
          new GravatarProvider(),
          new PhoneLookupProvider(),
        ],
        config: {
          github: { token: process.env.GITHUB_TOKEN },
        },
      });

      stream.send({ event: "start", data: { value, type } });

      await engine.scan(
        {
          type: type as QueryType,
          value: value.toLowerCase(),
          rawValue: value,
        },
        {
          onResult: (result) => {
            stream.send(result);
          },
        },
      );

      stream.send({ event: "end", data: { message: "Scan complete" } });
      stream.close();
    });
  })
  .listen(3001);

console.log(`🚀 Server is running at http://localhost:3001`);

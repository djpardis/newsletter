import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types.js";
import { sendEmail } from "./resend.js";

const baseEnv: Env = {
  DB: {} as D1Database,
  RESEND_API_KEY: "re_test",
  FROM_EMAIL: "Newsletter <newsletter@example.com>",
  BASE_URL: "https://newsletter.example.com",
  ADMIN_BEARER_TOKEN: "token",
};

describe("sendEmail reply_to", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ id: "msg_1" }, { status: 200 }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets reply_to on campaign mail when REPLY_TO is configured", async () => {
    await sendEmail(
      { ...baseEnv, REPLY_TO: "hello@example.com" },
      {
        to: "user@example.com",
        subject: "Test",
        text: "Hi",
        unsubscribeUrl: "https://newsletter.example.com/api/unsubscribe?token=x",
      },
    );

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.reply_to).toBe("hello@example.com");
  });

  it("omits reply_to on transactional mail even when REPLY_TO is configured", async () => {
    await sendEmail(
      { ...baseEnv, REPLY_TO: "hello@example.com" },
      {
        to: "user@example.com",
        subject: "Confirm",
        text: "Hi",
        transactional: true,
      },
    );

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.reply_to).toBeUndefined();
  });
});
